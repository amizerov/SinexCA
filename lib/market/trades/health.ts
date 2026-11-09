/** A quiet, acknowledged trade channel can be healthy even when its last trade is old. */
export function tradeWatchdog(now:number,openedAt:number,lastData:number,lastTransport:number,subscribed:boolean){
  return {stale:now-(lastData||openedAt)>20000,close:now-lastTransport>45000||!subscribed&&now-openedAt>45000};
}
