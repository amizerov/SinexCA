import {z} from "zod";
import {authFailure,requestAccount} from "./accounts";
import {AccountError} from "./account-store";
import {isSameOrigin} from "@/lib/drawings/same-origin";
export async function profileAccount(request:Request){
  if(!isSameOrigin(request))throw new AccountError("Недопустимый источник запроса.",403);
  const account=await requestAccount(),user=account.session.user;
  if(account.fresh||!user)throw new AccountError("Для изменения профиля войдите в аккаунт.",401);
  if(request.headers.get("X-Workspace-Id")!==account.session.ownerId)throw new AccountError("Аккаунт изменился. Обновите страницу.",409);
  return {...account,user};
}
export function profileFailure(error:unknown){
  if(error instanceof AccountError)return authFailure(error);
  if(error instanceof z.ZodError)return authFailure(new AccountError(error.issues.find(issue=>/[А-Яа-я]/.test(issue.message))?.message||"Проверьте поля профиля.",400,"INVALID_PROFILE"));
  return authFailure(new AccountError(error instanceof SyntaxError?"Некорректный запрос.":"Не удалось сохранить профиль. Повторите позже.",error instanceof SyntaxError?400:500));
}
