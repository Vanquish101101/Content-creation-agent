// src/router/route.js
// Роутер по wizard.content_type — text (Слайс 2) и image (Слайс 4) реализованы.
// video/audio — Слайсы 5-6, см. «08. Задачник».
import { createTextCascade } from '../generation/text/cascade.js';
import { createImageCascade } from '../generation/image/cascade.js';

export function routeByContentType(contentType, deps = {}) {
  switch (contentType) {
    case 'text':
      return createTextCascade(deps.text);
    case 'image':
      return createImageCascade(deps.image);
    default:
      throw new Error(
        `routeByContentType: content_type "${contentType}" not implemented yet (см. «08. Задачник», Слайсы 5-6)`
      );
  }
}
