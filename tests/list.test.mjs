import assert from 'node:assert/strict';
import { splitList, lastToken, pickInList, unpickInList } from '../extension/src/shared/list.js';

assert.deepEqual(splitList(' vi_VN; fr_BE;fr_CA ;;'), ['vi_VN', 'fr_BE', 'fr_CA']);
assert.deepEqual(splitList('sale, stock sale'), ['sale', 'stock']);
assert.deepEqual(splitList(''), []);
assert.deepEqual(splitList(undefined), []);

// one input: the word being typed searches the installed modules, a tick replaces it
const known = new Set(['sale', 'stock', 'account', 'web']);
assert.equal(lastToken('sale; acc'), 'acc');
assert.equal(lastToken('sale; '), '');
assert.equal(pickInList('sale; acc', 'account', known), 'sale; account; ', 'the search becomes the pick');
assert.equal(pickInList('sale', 'web', known), 'sale; web; ', 'a full name typed is kept');
assert.equal(pickInList('', 'web', known), 'web; ');
assert.equal(pickInList('web; ', 'web', known), 'web; ', 'no duplicate');
assert.equal(unpickInList('sale; web; acc', 'sale', known), 'web; acc', 'the search being typed stays');
assert.equal(unpickInList('sale; web; ', 'web', known), 'sale; ');
