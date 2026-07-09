// src/router/route.js
// Роутер по wizard.content_type — только "text" реализован (Слайс 2).
// image/video/audio — Слайсы 4-6, см. «08. Задачник».
import { createTextCascade } from '../generation/text/cascade.js';

export function routeByContentType(contentType, deps) {
  switch (contentType) {
    case 'text':
      return createTextCascade(deps);
    default:
      throw new Error(
        `routeByContentType: content_type "${contentType}" not implemented yet (см. «08. Задачник», Слайсы 4-6)`
      );
  }
}
