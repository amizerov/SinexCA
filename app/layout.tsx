import type { Metadata } from "next";
import "./globals.css";
import {SITE_DESCRIPTION,SITE_NAME,SITE_URL} from "@/lib/content/site";
const themeBootScript = `(function(){try{var t=localStorage.getItem("sinex:theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch(e){document.documentElement.dataset.theme="dark"}})()`;
export const metadata: Metadata = {
  metadataBase:new URL(SITE_URL),
  title:{default:"Sinex — терминал анализа криптовалютного рынка",template:"%s — Sinex"},
  description:SITE_DESCRIPTION,
  applicationName:SITE_NAME,
  alternates:{canonical:"/"},
  openGraph:{type:"website",locale:"ru_RU",siteName:SITE_NAME,title:"Sinex — терминал анализа криптовалютного рынка",description:SITE_DESCRIPTION,url:SITE_URL},
  twitter:{card:"summary_large_image",title:"Sinex — терминал анализа криптовалютного рынка",description:SITE_DESCRIPTION},
  robots:{index:true,follow:true},
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jsonLd={"@context":"https://schema.org","@type":"Organization",name:SITE_NAME,url:SITE_URL,description:SITE_DESCRIPTION};
  return <html lang="ru" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootScript}}/></head><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,"\\u003c")}}/>{children}</body></html>;
}
