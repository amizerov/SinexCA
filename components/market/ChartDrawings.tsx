"use client";
import { useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { LineStyle, type IChartApi, type IPriceLine, type ISeriesApi } from "lightweight-charts";
import { Check, Magnet, Minus, MousePointer2, Trash2, Undo2,Redo2, X,TrendingUp } from "lucide-react";
import { TrendLines } from "./TrendLines";
import { useDrawingLevels } from "@/hooks/use-drawing-levels";
import type { DrawingScope, HorizontalLevel } from "@/lib/drawings/types";
import type { Candle } from "@/lib/market/types";
import { price } from "@/lib/market/format";

interface Props { ownerId:string; scope: DrawingScope; chart: RefObject<IChartApi | null>; series: RefObject<ISeriesApi<"Candlestick"> | null>; candles: Candle[] }
const COLORS = ["#b4ed8b", "#63c8ff", "#f6c76e", "#f28c9b", "#b39aff"];
export function ChartDrawings({ ownerId, scope, chart, series, candles }: Props) {
  const drawing = useDrawingLevels(scope,ownerId);
  const [mode, setMode] = useState(false);
  const [trendMode,setTrendMode]=useState(false);
  const [magnet, setMagnet] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<{ id: string; before: HorizontalLevel[]; moved: boolean;x:number;y:number } | null>(null);
  const latest = useRef({ drawing, selectedId, candles });
  const scheduleRef = useRef<() => void>(() => {});
  useEffect(() => { latest.current = { drawing, selectedId, candles }; }, [drawing, selectedId, candles]);
  const selected = drawing.levels.find(level => level.id === selectedId);
  const enabled = drawing.ready && candles.length > 0;

  useEffect(() => {
    let frame = 0, stopped = false;
    let boundChart: IChartApi | null = null;
    let source: ISeriesApi<"Candlestick"> | null = null;
    const lines = new Map<string, { api: IPriceLine; value: string }>();
    const ownsLiveSeries=()=>chart.current===boundChart&&series.current===source;
    function tick() {
      if(stopped)return;
      const currentSeries = series.current, instance = chart.current;
      if (currentSeries && instance) {
        if(boundChart!==instance){lines.clear();source=null;boundChart=null;}
        if (!boundChart) {
          boundChart = instance;
          instance.timeScale().subscribeVisibleLogicalRangeChange(schedule);
        }
        source = currentSeries;
        const state = latest.current;
        const ids = new Set(state.drawing.levels.filter(line=>line.type!=="trend").map(level => level.id));
        for (const [id, line] of lines) if (!ids.has(id)) { currentSeries.removePriceLine(line.api); lines.delete(id); }
        const pane = instance.paneSize(0);
        if (surface.current) { surface.current.style.width = `${pane.width}px`; surface.current.style.height = `${pane.height}px`; }
        for (const level of state.drawing.levels) {
          if(level.type==="trend")continue;
          const active = level.id === state.selectedId;
          const value = `${level.price}:${level.color}:${active}:${level.width}:${level.style}`;
          const options = { price: level.price, color: level.color, lineWidth: (level.width||1) as 1|2|3|4, lineStyle: level.style==="dashed"?LineStyle.Dashed:level.style==="dotted"?LineStyle.Dotted:LineStyle.Solid, axisLabelVisible: true, title: active ? "Уровень" : "" };
          const existing = lines.get(level.id);
          if (!existing) lines.set(level.id, { api: currentSeries.createPriceLine(options), value });
          else if (existing.value !== value) { existing.api.applyOptions(options); existing.value = value; }
          const y = currentSeries.priceToCoordinate(level.price);
          const handle = handles.current.get(level.id);
          if (handle) {
            const visible = y !== null && y >= 0 && y <= pane.height;
            const display = visible ? "block" : "none";
            if (handle.style.display !== display) handle.style.display = display;
            if (visible) {
              const transform = `translateY(${y - 7}px)`, width = `${pane.width}px`;
              if (handle.style.transform !== transform) handle.style.transform = transform;
              if (handle.style.width !== width) handle.style.width = width;
            }
          }
        }
      }
    }
    function schedule() {
      if (stopped || frame) return;
      frame = requestAnimationFrame(() => {
        if(stopped)return;
        tick();
        // One settling frame follows Lightweight Charts' asynchronous autoscale/layout pass.
        frame = requestAnimationFrame(() => { frame = 0; if (!stopped) tick(); });
      });
    }
    scheduleRef.current = schedule;
    schedule();
    const host = root.current?.parentElement;
    const resize = new ResizeObserver(schedule);
    if (host) resize.observe(host);
    const onMove = (event: PointerEvent) => { if (event.buttons) schedule(); };
    const clearSelection = (event: PointerEvent) => {
      // This native listener runs before React's delegated pointer handlers.
      // Editing a control must not clear selection and unmount that control before its click.
      if ((event.target as HTMLElement).closest(".drawing-rail,.level-editor,.level-hit,.trend-hit,.trend-endpoint,.drawing-surface,.drawing-notice")) return;
      setSelectedId(null);
    };
    host?.addEventListener("pointerdown", clearSelection);
    host?.addEventListener("pointermove", onMove);
    host?.addEventListener("pointerup", schedule);
    host?.addEventListener("wheel", schedule, { passive: true });
    host?.addEventListener("dblclick", schedule);
    host?.addEventListener("sinex:chart-layout", schedule);
    return () => {
      stopped = true; scheduleRef.current = () => {}; resize.disconnect();
      cancelAnimationFrame(frame); host?.removeEventListener("pointerdown", clearSelection);
      host?.removeEventListener("pointermove", onMove); host?.removeEventListener("pointerup", schedule);
      host?.removeEventListener("wheel", schedule); host?.removeEventListener("dblclick", schedule);
      host?.removeEventListener("sinex:chart-layout", schedule);
      // Parent cleanup runs first. Removing lines from a disposed series queues a new
      // library draw against destroyed canvases; catching that call cannot catch the later RAF.
      if(boundChart&&source&&ownsLiveSeries()){
        boundChart.timeScale().unsubscribeVisibleLogicalRangeChange(schedule);
        for(const line of lines.values())source.removePriceLine(line.api);
      }
      lines.clear();
    };
  }, [chart, series]);

  useEffect(() => { scheduleRef.current(); }, [drawing.levels, selectedId, candles, mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,textarea,select,[contenteditable=true],dialog")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && drawing.ready) { event.preventDefault(); if(event.shiftKey)drawing.redo();else drawing.undo(); setSelectedId(null); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y" && drawing.ready) {event.preventDefault();drawing.redo();setSelectedId(null);}
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && drawing.ready) { event.preventDefault(); drawing.commit(drawing.levels.filter(level => level.id !== selectedId)); setSelectedId(null); }
      if (event.key === "Escape") {
        if (drag.current) { drawing.preview(drag.current.before); drag.current = null; setDragging(false); }
        setMode(false);setTrendMode(false); setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, selectedId]);

  function eventPrice(event: ReactPointerEvent): number | null {
    const host = root.current?.parentElement, instance = chart.current, currentSeries = series.current;
    if (!host || !instance || !currentSeries) return null;
    const bounds = host.getBoundingClientRect(), y = event.clientY - bounds.top, x = event.clientX - bounds.left;
    const pane = instance.paneSize(0);
    if (y < 0 || y > pane.height || x < 0 || x > pane.width) return null;
    const initial = currentSeries.coordinateToPrice(y);
    if (initial === null || !Number.isFinite(initial) || initial <= 0 || initial > 1e12) return null;
    let value: number = initial;
    if (magnet || event.shiftKey) {
      const time = instance.timeScale().coordinateToTime(x);
      const candle = typeof time === "number" ? candles.find(c => c.time === time) : undefined;
      if (candle) {
        const nearest = [candle.high, candle.low].map(p => ({ price: p, distance: Math.abs((currentSeries.priceToCoordinate(p) ?? Infinity) - y) })).sort((a,b) => a.distance - b.distance)[0];
        if (nearest.distance <= 12) value = nearest.price;
      }
    }
    return Number(value.toPrecision(12));
  }
  function create(event: ReactPointerEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!enabled || drawing.levels.length >= 100) return;
    const value = eventPrice(event); if (value === null) return;
    const level = { id: crypto.randomUUID(), price: value, color: COLORS[0] };
    drawing.commit([...drawing.levels, level]); setSelectedId(level.id); setMode(false);
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, level: HorizontalLevel) {
    if(event.button!==0)return;
    event.preventDefault(); event.stopPropagation();
    if (!enabled) return;
    setSelectedId(level.id); setMode(false);
    drag.current = { id: level.id, before: drawing.levels, moved: false,x:event.clientX,y:event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    if(!drag.current.moved&&Math.hypot(event.clientX-drag.current.x,event.clientY-drag.current.y)<3)return;
    event.preventDefault(); event.stopPropagation();
    const value = eventPrice(event); if (value === null) return;
    drag.current.moved = true; setDragging(true);
    drawing.preview(drawing.getLevels().map(level => level.id === drag.current!.id ? { ...level, price: value } : level));
  }
  function endDrag(event: ReactPointerEvent<HTMLButtonElement>, cancel = false) {
    const current = drag.current; if (!current) return;
    event.stopPropagation(); drag.current = null; setDragging(false);
    if (cancel) drawing.preview(current.before);
    else if (current.moved) drawing.commit(drawing.getLevels(), current.before);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function editColor(color: string) { if (selected) drawing.commit(drawing.levels.map(level => level.id === selected.id ? { ...level, color } : level)); }
  return <div ref={root} className={`drawing-layer ${mode||trendMode ? "drawing-active" : ""}`}>
    <TrendLines key={trendMode?"draw":"select"} chart={chart} series={series} candles={candles} drawing={drawing} selectedId={selectedId} select={setSelectedId} active={trendMode} finish={()=>setTrendMode(false)} enabled={enabled} magnet={magnet}/>
    {mode && <div ref={surface} className="drawing-surface" aria-label="Поставить горизонтальный уровень" onPointerDown={create} />}
    <div className="drawing-rail" role="toolbar" aria-label="Разметка графика" onPointerDown={e => e.stopPropagation()}>
      <button className={`icon-button ${!mode&&!trendMode ? "selected" : ""}`} title="Выбор и перенос линии" aria-label="Выбор уровня" aria-pressed={!mode&&!trendMode} onClick={() => {setMode(false);setTrendMode(false);}}><MousePointer2 size={15} /></button>
      <button className={`icon-button ${mode ? "selected" : ""}`} title="Горизонтальный уровень — нажмите на график" aria-label="Горизонтальный уровень" aria-pressed={mode} disabled={!enabled || drawing.levels.length >= 100} onClick={() => { setMode(v => !v);setTrendMode(false); setSelectedId(null); }}><Minus size={17} /></button>
      <button className={`icon-button ${trendMode?"selected":""}`} title="Трендовая линия — две точки на графике" aria-label="Трендовая линия" aria-pressed={trendMode} disabled={!enabled||drawing.levels.length>=100} onClick={()=>{setTrendMode(value=>!value);setMode(false);setSelectedId(null);}}><TrendingUp size={17}/></button>
      <button className={`icon-button ${magnet ? "selected" : ""}`} title="Привязка к максимуму и минимуму свечи" aria-label="Привязка к свечам" aria-pressed={magnet} onClick={() => setMagnet(v => !v)}><Magnet size={15} /></button>
      <span className="drawing-divider" />
      <button className="icon-button" title="Отменить действие (Ctrl+Z)" aria-label="Отменить разметку" disabled={!drawing.undoCount || !drawing.ready} onClick={() => { drawing.undo(); setSelectedId(null); }}><Undo2 size={15} /></button>
      <button className="icon-button" title="Повторить действие (Ctrl+Shift+Z)" aria-label="Повторить разметку" disabled={!drawing.redoCount||!drawing.ready} onClick={()=>{drawing.redo();setSelectedId(null);}}><Redo2 size={15}/></button>
    </div>
    {drawing.levels.filter(level=>level.type!=="trend").map(level => <button key={level.id} ref={el => { if (el) handles.current.set(level.id, el); else handles.current.delete(level.id); }} className={`level-hit ${level.id === selectedId ? "selected" : ""}`} style={{ color: level.color }} data-level-id={level.id} aria-label={`Уровень ${level.price}`} title={`Уровень ${price(level.price)} — перетащите для переноса`} onPointerDown={e => startDrag(e, level)} onPointerMove={moveDrag} onPointerUp={e => endDrag(e)} onPointerCancel={e => endDrag(e, true)} onClick={e => { e.stopPropagation(); setSelectedId(level.id); }}><span /></button>)}
    {selected && <div className="level-editor" onPointerDown={e => e.stopPropagation()}>
      {selected.type!=="trend"&&<form key={`${selected.id}:${selected.price}`} onSubmit={event => { event.preventDefault(); const value = Number(new FormData(event.currentTarget).get("price")); if (Number.isFinite(value) && value > 0 && value <= 1e12) drawing.commit(drawing.levels.map(level => level.id === selected.id ? { ...level, price: value } : level)); }}>
        <input aria-label="Цена уровня" name="price" type="number" step="any" min="0.000000000001" max="1000000000000" required defaultValue={selected.price} />
        <button type="submit" className="icon-button" aria-label="Применить цену" title="Применить цену"><Check size={15} /></button>
      </form>}
      <div className="level-colors">{COLORS.map(color => <button key={color} className={`level-color ${selected.color === color ? "active" : ""}`} style={{ background: color }} aria-label={`Цвет ${color}`} aria-pressed={selected.color === color} onClick={() => editColor(color)} />)}</div>
      <select aria-label="Толщина линии" value={selected.width||1} onChange={event=>drawing.commit(drawing.levels.map(line=>line.id===selected.id?{...line,width:Number(event.target.value)}:line))}>{[1,2,3,4].map(width=><option key={width} value={width}>{width} px</option>)}</select>
      <select aria-label="Стиль линии" value={selected.style||"solid"} onChange={event=>drawing.commit(drawing.levels.map(line=>line.id===selected.id?{...line,style:event.target.value as "solid"|"dashed"|"dotted"}:line))}><option value="solid">Сплошная</option><option value="dashed">Штрих</option><option value="dotted">Точки</option></select>
      <button className="icon-button" aria-label="Удалить уровень" title="Удалить уровень (Delete)" onClick={() => { drawing.commit(drawing.levels.filter(level => level.id !== selected.id)); setSelectedId(null); }}><Trash2 size={15} /></button>
      <button className="icon-button" aria-label="Закрыть настройки уровня" onClick={() => setSelectedId(null)}><X size={14} /></button>
    </div>}
    <span className="drawing-save-status" role="status" data-save-status={drawing.status}>{dragging ? "Перенос уровня…" : drawing.status === "loading" ? "Загрузка уровней…" : drawing.status === "saving" ? "Сохранение…" : drawing.status === "saved" ? `Сохранённые уровни: ${drawing.levels.length}` : "Уровни не сохранены"}</span>
    {(drawing.status === "error" || drawing.status === "conflict") && <div className="drawing-notice" role="alert" onPointerDown={e => e.stopPropagation()}><span>{drawing.error}</span><button className="button" onClick={drawing.status === "conflict" ? drawing.reload : drawing.retry}>{drawing.status === "conflict" ? "Загрузить из базы" : "Повторить"}</button></div>}
  </div>;
}
