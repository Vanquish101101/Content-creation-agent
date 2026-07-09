// src/router/route.js
// Роутер по wizard.content_type — text (Слайс 2), image (Слайс 4) и video
// (Слайс 5) реализованы. audio — Слайс 6, см. «08. Задачник».
import { createTextCascade } from '../generation/text/cascade.js';
import { createImageCascade } from '../generation/image/cascade.js';
import { createVideoCascade } from '../generation/video/cascade.js';

export function routeByContentType(contentType, deps = {}) {
  switch (contentType) {
    case 'text':
      return createTextCascade(deps.text);
    case 'image':
      return createImageCascade(deps.image);
    case 'video':
      return createVideoCascade(deps.video);
    default:
      throw new Error(
        `routeByContentType: content_type "${contentType}" not implemented yet (см. «08. Задачник», Слайс 6)`
      );
  }
}
