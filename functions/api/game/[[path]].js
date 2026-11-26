// 遊戲區帳號（登入、金幣、每日禮包、救濟金）。程式在 lib/game-server.js
import { handleGame } from '../../../lib/game-server.js';

export function onRequest({ request, env, params }) {
  return handleGame(request, env, [].concat(params.path || []).join('/'));
}
