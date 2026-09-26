import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { t4Xml, t5Xml, validSin } from '../src/rules/slipxml';

/**
 * Validated against CRA's own schemas rather than against what this code
 * expects, because the only opinion that matters is the one CRA's upload
 * applies. Skipped where xmllint is not installed.
 */
let xmllint = true;
try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); } catch { xmllint = false; }

function validate(xml: string, root: string, year: '2026' | '2027') {
  const dir = mkdtempSync(join(tmpdir(), 'fc-xml-'));
  const f = join(dir, 'x.xml');
  writeFileSync(f, xml);
  return execFileSync('xmllint', ['--noout', '--schema',
    join(__dirname, `fixtures/cra-xsd-${year}`, root), f], { encoding: 'utf8', stdio: 'pipe' });
}

const party = { name: 'Northwind & Co. Inc.', line1: '1 Main St', city: 'Toronto', prov: 'ON', postal: 'm5v 1a1' };
const contact = { name: 'Jane Doe', area: '416', phone: '555 0100', email: 'jane@example.com' };

const t4 = t4Xml({
  year: 2026, bn: '123456789rp0001', employer: party, contact,
  slips: [{ surname: 'Doe', given: 'Jane', sin: '046 454 286', address: party, province: 'ON',
    eiExempt: true, income: 60_000_00, cpp: 3_361_25, cpp2: 0, ei: 0, tax: 8_500_00,
    insurable: 0, pensionable: 60_000_00 }],
  employerCpp: 3_361_25, employerEi: 0,
});
const t5 = t5Xml({
  year: 2026, bn: '123456789RZ0001', payer: party, contact, eligible: false,
  slips: [{ surname: 'Doe', given: 'Jane', sin: '046454286', address: party,
    actual: 20_000_00, taxable: 23_000_00, credit: 2_076_92 }],
});

describe.skipIf(!xmllint)('against CRA schemas', () => {
  for (const year of ['2026', '2027'] as const) {
    it(`a T4 validates against the ${year} package`, () => {
      expect(() => validate(t4, 'T619_T4.xsd', year)).not.toThrow();
    });
    it(`a T5 validates against the ${year} package`, () => {
      expect(() => validate(t5, 'T619_T5.xsd', year)).not.toThrow();
    });
  }
});

describe('what goes in the file', () => {
  it('escapes names and normalises the account number', () => {
    expect(t4).toContain('Northwind &amp; Co. Inc.');
    expect(t4).toContain('<bn>123456789RP0001</bn>');
  });
  it('leaves zero optional amounts out, as CRA now requires', () => {
    expect(t4).not.toContain('<empe_eip_amt>');
    expect(t4).toContain('<ei_insu_ern_amt>0.00</ei_insu_ern_amt>');
  });
  it('uses the eligible dividend tags only for eligible dividends', () => {
    expect(t5).toContain('<actl_dvnd_amt>20000.00</actl_dvnd_amt>');
    expect(t5).not.toContain('actl_elg_dvamt');
  });
});

describe('SIN check', () => {
  it('accepts a valid SIN and rejects a mistyped one', () => {
    expect(validSin('046 454 286')).toBe(true);
    expect(validSin('046 454 287')).toBe(false);
    expect(validSin('12345')).toBe(false);
  });
});
