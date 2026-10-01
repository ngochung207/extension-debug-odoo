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
  };

  readonly rules: {
    /** ir.rule._compute_domain skips _inherits parents whose link field is not stored */
    readonly inheritsStoredOnly: boolean;
  };

  readonly profiler: {
    /** ir.profile fields read for the list of profiled requests */
    readonly listFields: readonly string[];
  };

  readonly api: {
    /** /json/2/<model>/<method> with a Bearer API key: the external API Copy as cURL targets */
    readonly json2: boolean;
  };

  readonly orm: {
    /** methods that only read: allowed by the Code tab in read-only mode */
    readonly readMethods: readonly string[];
    /** @api.model methods: called without ids */
    readonly modelMethods: readonly string[];
  };

  /** the fields above, verified on the live database */
  readonly expects: readonly ExpectedField[];
}
