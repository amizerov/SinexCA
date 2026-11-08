import type {CoinProfile} from "./coin-profile";
/** Vetted supplements fill gaps in public catalogs; resolution still covers the full catalogs. */
export function verifiedCoinHistory(profile:CoinProfile):CoinProfile{
  if(!["hyperliquid","hype-hyperliquid"].includes(profile.id)||profile.asset!=="HYPE")return profile;
  return {...profile,
    creators:[{name:"Jeff",role:"Руководитель Hyperliquid Labs"},{name:"iliensinc",role:"Руководитель Hyperliquid Labs"}],
    history:"Hyperliquid создаёт команда Hyperliquid Labs под руководством Jeff и iliensinc. Команда перешла к DeFi летом 2022 года. Разработка биржи бессрочных контрактов с книгой заявок началась в сентябре 2022 года, тестовая сеть собственного блокчейна — в декабре 2022 года. Закрытая альфа основной сети заработала в феврале 2023 года.\n\nЦель проекта — совместить скорость и удобство биржевого интерфейса с исполнением сделок в блокчейне. По официальной документации, Hyperliquid Labs финансирует разработку самостоятельно, без привлечения внешнего капитала.",
    historySource:{name:"Официальная документация Hyperliquid",url:"https://hyperliquid.gitbook.io/hyperliquid-docs/about-hyperliquid/core-contributors"},
    additionalSources:[...profile.additionalSources||[],{name:"Хронология запуска · Hyperliquid",url:"https://hyperliquid.medium.com/hyperliquid-q2-update-7c39c726c45b"}],
  };
}
