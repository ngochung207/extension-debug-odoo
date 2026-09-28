import assert from 'node:assert/strict';
import { buildViewTree } from '../src/features/view/logic.js';

// view tree: 1 base, 2 ext of 1, 3 primary child of 1 (current), 4 ext of 3, 5 other primary of 1, 6 ext of 5
const v = (id, parent, mode, priority = 16) => ({ id, inherit_id: parent ? [parent, ''] : false, mode, priority });
const tree = buildViewTree([v(1, 0, 'primary'), v(2, 1, 'extension', 20), v(3, 1, 'primary'), v(4, 3, 'extension'),
  v(5, 1, 'primary'), v(6, 5, 'extension'), v(7, 1, 'extension', 10)], 3);
assert.deepEqual(tree.map((t) => [t.view.id, t.depth]), [[1, 0], [7, 1], [3, 1], [4, 2], [2, 1]]);
assert.deepEqual(buildViewTree([], 9), []);
