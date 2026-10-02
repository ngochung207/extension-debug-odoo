// Every difference between Odoo versions the panel depends on, in one contract. Features never test a version number
// or probe a field themselves: they ask the adapter of the Odoo they are on (odoo/detect.ts → odoo()). Adding a version
// = one new adapters/v<major>.ts implementing this, registered in detect.ts; the compiler lists what it must answer.

import type { SupportedMajor } from './version.ts';

/** A field the adapter relies on: checked against the database once per page load (detect.ts → selfCheck). */
export interface ExpectedField {
  model: string;
  field: string;
  /** what breaks without it, shown in the header when the check fails */
  usedBy: string;
}

/** A method's parameters, in order, and whether it is @api.model (called without ids). */
export interface MethodSignature {
  readonly params: readonly string[];
  readonly model: boolean;
}

/**
 * jsonrpc: /jsonrpc, object service, execute_kw(db, uid, API key, model, method, args, kwargs): the call_kw arguments
 *          fit as they are (positional + keyword).
 * json2:   /json/2/<model>/<method>, `Authorization: bearer <API key>`, a JSON object of NAMED arguments plus ids and
 *          context: positional arguments must be named, from /doc/<model>.json (api_doc) when the user may read it,
 *          else from `signatures` (the common ORM methods).
 */
export type ExternalApi =
  | { readonly kind: 'jsonrpc' }
  | { readonly kind: 'json2'; readonly signatures: Readonly<Record<string, MethodSignature>> };

export interface OdooAdapter {
  readonly major: SupportedMajor;

  readonly users: {
    /** res.users field: every group the user has, implied included (read) */
    readonly allGroupsField: string;
    /** res.users field: the groups set on the user, to add (4) / remove (3) one (write) */
    readonly writeGroupsField: string;
  };

  readonly groups: {
    /** res.groups field: every group it implies, transitively */
    readonly impliedField: string;
    /** whether impliedField lists the group itself too */
    readonly impliedIncludesSelf: boolean;
    /** res.groups many2one: the application a group belongs to, the prefix of its full_name ("Sales / User") */
    readonly appField: string;
    /** res.groups many2many: every user in the group, through an implying group too */
    readonly usersField: string;
  };

  readonly rules: {
    /** ir.rule._compute_domain skips _inherits parents whose link field is not stored */
    readonly inheritsStoredOnly: boolean;
    /** the names ir.rule._eval_context gives a rule's domain (the webclient's py_js knows more: `time` always) */
    readonly evalNames: readonly string[];
  };

  readonly i18n: {
    /** GET route of the webclient's code translations, per module: { modules: { <module>: { messages: [{ id, string }] } } }
     * (?lang=, every installed module); `{unique}` stands for any string */
    readonly webTranslationsPath: string;
  };

  readonly profiler: {
    /** ir.profile fields read for the list of profiled requests */
    readonly listFields: readonly string[];
    /** /web/speedscope/<…>: several profiles at once (ids joined by commas) */
    readonly speedscopeMany: boolean;
    /** /web/speedscope answers 404 once profiling is no longer enabled on the database */
    readonly speedscopeNeedsEnabled: boolean;
  };

  readonly modules: {
    /** base.module.uninstall, the preview Odoo shows before an uninstall: the field taking the module (18: a many2one,
     * one module; 19: a many2many) and the one listing every module removed with it (itself included) */
    readonly uninstallWizard: { readonly moduleField: string; readonly many: boolean; readonly impactedField: string };
    /** Odoo refuses an install / upgrade / uninstall while modules wait for one (to install / upgrade / remove);
     * false: it runs the waiting ones along with it */
    readonly refusesWhilePending: boolean;
  };

  /** The external API a call of the page is replayed with (RPC tab → Copy as cURL). */
  readonly api: ExternalApi;

  readonly orm: {
    /** methods that only read: allowed by the Code tab in read-only mode */
    readonly readMethods: readonly string[];
    /** @api.model methods: called without ids */
    readonly modelMethods: readonly string[];
  };

  /** the fields above, verified on the live database */
  readonly expects: readonly ExpectedField[];
}
