// src/router/route.js
// Роутер по wizard.content_type — text/image/video/audio реализованы
// (Слайсы 2, 4-6). Все типы контента, запланированные в MVP, готовы.
import { createTextCascade } from '../generation/text/cascade.js';
import { createImageCascade } from '../generation/image/cascade.js';
import { createVideoCascade } from '../generation/video/cascade.js';
import { createAudioCascade } from '../generation/audio/cascade.js';

export function routeByContentType(contentType, deps = {}) {
  switch (contentType) {
    case 'text':
      return createTextCascade(deps.text);
    case 'image':
      return createImageCascade(deps.image);
    case 'video':
      return createVideoCascade(deps.video);
    case 'audio':
      return createAudioCascade(deps.audio);
    default:
      throw new Error(`routeByContentType: unknown content_type "${contentType}"`);
  }
}
