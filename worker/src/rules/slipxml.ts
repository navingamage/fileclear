/**
 * T4 and T5 slips as the XML CRA's Internet File Transfer accepts.
 *
 * The one filing FileClear can produce in a form CRA takes directly: CRA
 * accepts information returns from "in-house developed software" with no
 * certification, as long as the file validates against its published schema.
 * The generator is tested against both CRA schema packages, xmlschm1-26-3 and
 * the draft 1-27-1, vendored under test/fixtures.
 *
 * Nothing here stores a SIN. The caller passes it in for one file and it goes
 * nowhere else.
 */

export interface Party {
  name: string;
  line1: string;
  city: string;
  prov: string;
  postal: string;
}
export interface Contact { name: string; area: string; phone: string; email: string }

export interface T4Input {
  year: number;
  /** 123456789RP0001 */
  bn: string;
  employer: Party;
  contact: Contact;
  slips: {
    surname: string; given: string; sin: string; address: Party;
    province: string; eiExempt: boolean; cppExempt?: boolean;
    /** Cents. */
    income: number; cpp: number; cpp2: number; ei: number; tax: number;
    insurable: number; pensionable: number;
  }[];
  employerCpp: number;
  employerEi: number;
}

export interface T5Input {
  year: number;
  /** 123456789RZ0001: T5s are filed under an RZ account, not the payroll one. */
  bn: string;
  payer: Party;
  contact: Contact;
  eligible: boolean;
  slips: { surname: string; given: string; sin: string; address: Party;
    actual: number; taxable: number; credit: number }[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const money = (c: number) => (Math.round(c) / 100).toFixed(2);
const el = (tag: string, v: string | undefined) => (v ? `<${tag}>${esc(v)}</${tag}>` : '');
const digits = (s: string) => s.replace(/\D/g, '');

/** CRA validates SINs with the Luhn check; a slip with a bad one is rejected. */
export function validSin(sin: string): boolean {
  const d = digits(sin);
  if (d.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[i]) * (i % 2 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

const address = (tag: string, a: Party) => `<${tag}>${el('addr_l1_txt', a.line1)}${
  el('cty_nm', a.city)}${el('prov_cd', a.prov)}<cntry_cd>CAN</cntry_cd>${
  el('pstl_cd', a.postal.toUpperCase())}</${tag}>`;

function t619(bn: string, name: string, c: Contact): string {
  const phone = digits(c.phone);
  return `<T619><TransmitterAccountNumber><bn15>${esc(bn.toUpperCase())}</bn15></TransmitterAccountNumber>`
    + `<summ_cnt>1</summ_cnt><lang_cd>E</lang_cd>`
    + `<TransmitterName><l1_nm>${esc(name.slice(0, 35))}</l1_nm></TransmitterName>`
    + `<TransmitterCountryCode>CAN</TransmitterCountryCode>`
    + `<CNTC><cntc_nm>${esc(c.name.slice(0, 35))}</cntc_nm><cntc_area_cd>${digits(c.area)}</cntc_area_cd>`
    + `<cntc_phn_nbr>${phone.slice(0, 3)}-${phone.slice(3, 7)}</cntc_phn_nbr>`
    + `<cntc_email_area>${esc(c.email)}</cntc_email_area></CNTC></T619>`;
}

const summaryContact = (c: Contact) => {
  const p = digits(c.phone);
  return `<CNTC><cntc_nm>${esc(c.name)}</cntc_nm><cntc_area_cd>${digits(c.area)}</cntc_area_cd>`
    + `<cntc_phn_nbr>${p.slice(0, 3)}-${p.slice(3, 7)}</cntc_phn_nbr></CNTC>`;
};

const wrap = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n`
  + `<Submission xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${body}</Submission>\n`;

/** Optional amounts are left out when zero: CRA rejects empty optional fields since October 2025. */
const amt = (tag: string, c: number, keep = false) => (c || keep ? `<${tag}>${money(c)}</${tag}>` : '');

export function t4Xml(t: T4Input): string {
  const sum = (k: keyof T4Input['slips'][number]) =>
    t.slips.reduce((n, s) => n + (s[k] as number), 0);
  const slips = t.slips.map((s) => `<T4Slip><EMPE_NM>${el('snm', s.surname)}${el('gvn_nm', s.given)}</EMPE_NM>`
    + address('EMPE_ADDR', s.address)
    + `<sin>${digits(s.sin)}</sin><bn>${esc(t.bn.toUpperCase())}</bn>`
    + `<cpp_qpp_xmpt_cd>${s.cppExempt ? 1 : 0}</cpp_qpp_xmpt_cd><ei_xmpt_cd>${s.eiExempt ? 1 : 0}</ei_xmpt_cd>`
    + `<rpt_tcd>O</rpt_tcd><empt_prov_cd>${esc(s.province)}</empt_prov_cd>`
    + `<T4_AMT>${amt('empt_incamt', s.income)}${amt('cpp_cntrb_amt', s.cpp)}${amt('cppe_cntrb_amt', s.cpp2)}`
    + `${amt('empe_eip_amt', s.ei)}${amt('itx_ddct_amt', s.tax)}`
    + `${amt('ei_insu_ern_amt', s.insurable, true)}${amt('cpp_qpp_ern_amt', s.pensionable, true)}</T4_AMT></T4Slip>`).join('');
  const summary = `<T4Summary><bn>${esc(t.bn.toUpperCase())}</bn><EMPR_NM><l1_nm>${esc(t.employer.name)}</l1_nm></EMPR_NM>`
    + address('EMPR_ADDR', t.employer) + summaryContact(t.contact)
    + `<tx_yr>${t.year}</tx_yr><slp_cnt>${t.slips.length}</slp_cnt><rpt_tcd>O</rpt_tcd>`
    + `<T4_TAMT>${amt('tot_empt_incamt', sum('income'))}${amt('tot_empe_cpp_amt', sum('cpp'))}`
    + `${amt('tot_empe_cppe_amt', sum('cpp2'))}${amt('tot_empe_eip_amt', sum('ei'))}`
    + `${amt('tot_itx_ddct_amt', sum('tax'))}${amt('tot_empr_cpp_amt', t.employerCpp)}`
    + `${amt('tot_empr_eip_amt', t.employerEi)}</T4_TAMT></T4Summary>`;
  return wrap(t619(t.bn, t.employer.name, t.contact) + `<Return><T4>${slips}${summary}</T4></Return>`);
}

export function t5Xml(t: T5Input): string {
  const [a, tx, cr] = t.eligible
    ? ['actl_elg_dvamt', 'tx_elg_dvnd_pamt', 'enhn_dvtc_amt']
    : ['actl_dvnd_amt', 'tx_dvnd_amt', 'dvnd_tx_cr_amt'];
  const tot = (k: 'actual' | 'taxable' | 'credit') => t.slips.reduce((n, s) => n + s[k], 0);
  // CRA's own values for an individual recipient with no business number,
  // trust account or bank: the schema requires the fields and the T5
  // specification says what goes in them.
  const slips = t.slips.map((s) => `<T5Slip><RCPNT_NM>${el('snm', s.surname)}${el('gvn_nm', s.given)}</RCPNT_NM>`
    + `<sin>${digits(s.sin)}</sin><slp_rcpnt_bn>000000000</slp_rcpnt_bn><rcpnt_tr_acct_nbr>T00000000</rcpnt_tr_acct_nbr>`
    + address('RCPNT_ADDR', s.address)
    + `<bn>${esc(t.bn.toUpperCase())}</bn><rcpnt_fi_br_nbr>00000</rcpnt_fi_br_nbr><rcpnt_fi_acct_nbr>0</rcpnt_fi_acct_nbr>`
    + `<rpt_tcd>O</rpt_tcd><rcpnt_tcd>1</rcpnt_tcd>`
    + `<T5_AMT>${amt(a, s.actual)}${amt(tx, s.taxable)}${amt(cr, s.credit)}</T5_AMT></T5Slip>`).join('');
  const totTags = t.eligible
    ? ['tot_actl_elg_dvamt', 'tot_tx_elg_dvamt', 'tot_enhn_dvtc_amt']
    : ['tot_actl_dvnd_amt', 'tot_tx_dvnd_amt', 'tot_dvnd_tx_cr_amt'];
  const summary = `<T5Summary><bn>${esc(t.bn.toUpperCase())}</bn><FILR_NM><l1_nm>${esc(t.payer.name)}</l1_nm></FILR_NM>`
    + address('FILR_ADDR', t.payer) + summaryContact(t.contact)
    + `<filr_fi_br_nbr>00000</filr_fi_br_nbr><tx_yr>${t.year}</tx_yr><slp_cnt>${t.slips.length}</slp_cnt><rpt_tcd>O</rpt_tcd>`
    + `<T5_TAMT>${amt(totTags[0]!, tot('actual'))}${amt(totTags[1]!, tot('taxable'))}${amt(totTags[2]!, tot('credit'))}</T5_TAMT></T5Summary>`;
  return wrap(t619(t.bn, t.payer.name, t.contact) + `<Return><T5>${slips}${summary}</T5></Return>`);
}
