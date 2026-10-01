// The server reads several tabs share. Those that only change on a page load are cached (extension/page-cache.ts);
// ACLs and rules are not: they are what people edit while debugging.
import { cached } from '../extension/page-cache.ts';
import { MODES, type FieldsGet, type IrModelAccess, type IrModule, type IrRule, type SessionInfo } from './models.ts';
import { call, rpc } from './rpc.ts';
import type { Json } from '../contracts/json.ts';

const FIELD_ATTRS = ['string', 'type', 'relation', 'store', 'depends', 'related', 'readonly', 'required', 'groups'];

export const sessionInfo = () => cached('session', () => rpc<SessionInfo>('/web/session/get_session_info', {}));

export const fieldsOf = (model: string) => cached(`fields ${model}`, () => call<FieldsGet>(model, 'fields_get', [], { attributes: FIELD_ATTRS }));

// latest_version = the version installed in the DB (installed_version is computed from the manifest on disk: slow)
export const installedModules = () => cached('modules', () => call<IrModule[]>('ir.module.module', 'search_read', [[['state', '=', 'installed']]],
  { fields: ['name', 'shortdesc', 'latest_version', 'author'], order: 'name' }));

const PERMS = MODES.map((m) => `perm_${m}`);
const ofModel = (model: string): Json[] => [[['model_id.model', '=', model]]];
export const readAcls = (model: string) => call<IrModelAccess[]>('ir.model.access', 'search_read', ofModel(model), { fields: ['name', 'group_id', ...PERMS] });
export const readRules = (model: string) => call<IrRule[]>('ir.rule', 'search_read', ofModel(model), { fields: ['name', 'groups', 'domain_force', 'global', ...PERMS] });
