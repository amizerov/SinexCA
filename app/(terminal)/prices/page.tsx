import {PriceComparison} from "@/components/market/PriceComparison";
import {pageMetadata} from "@/lib/content/seo";
export const metadata=pageMetadata("Цены на биржах","Сравнение Spot-котировок в USDT, Bid/Ask и направлений обмена между биржами.","/prices");
export default function PricesPage(){return <PriceComparison/>;}
