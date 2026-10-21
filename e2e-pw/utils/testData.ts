import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { UserCredentials } from '../types/user.types';
import type { LocationFormData } from '../types/location.types';
import { generateRandomEmail, generateRandomPhoneNumber } from './commonUtils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadJson<T>(relativePath: string): T {
  const full = path.resolve(__dirname, '..', relativePath);
  return JSON.parse(fs.readFileSync(full, 'utf-8')) as T;
}

export function getAdminUser(): UserCredentials {
  const data = loadJson<{ admin: UserCredentials }>('test-data/users.json');
  return {
    username: process.env.ADMIN_USERNAME ?? data.admin.username,
    password: process.env.ADMIN_PASSWORD ?? data.admin.password,
  };
}

export function getValidLocation(): LocationFormData {
  const data = loadJson<{ validLocation: LocationFormData }>(
    'test-data/locations.json',
  );
  return {
    ...data.validLocation,
    contactNumber: generateRandomPhoneNumber(),
  };
}

/** Random company contact update (TC-COM-002). */
export function getCompanyContactUpdate(): { contactPerson: string; contactNumber: string } {
  return {
    contactPerson: `QA Contact ${Date.now().toString().slice(-5)}`,
    contactNumber: generateRandomPhoneNumber(),
  };
}

/** Random client for Client master tests (TC-CLT-*). */
export interface NewClient {
  companyName: string;
  code: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  pin: string;
}

export function getNewClient(): NewClient {
  const stamp = Date.now().toString().slice(-6);
  return {
    companyName: `QA Client ${stamp}`,
    code: `QAC${stamp}`,
    address: `${stamp} Test Street, Noida`,
    contactPerson: 'QA Person',
    contactEmail: generateRandomEmail('qaclient'),
    contactPhone: generateRandomPhoneNumber(),
    // pin is required by the DB (bigint, rejects '') — always fill it.
    pin: '201301',
  };
}

/** Valid username + wrong password (negative login). */
export function getInvalidPasswordUser(): UserCredentials {
  return {
    username: getAdminUser().username,
    password: `wrong-${Date.now()}`,
  };
}

/** Random username that must not exist (user-enumeration probe). */
export function getNonexistentUser(): UserCredentials {
  return {
    username: generateRandomEmail('nouser'),
    password: 'WrongPass123!',
  };
}

/**
 * Throwaway identity for the throttle test. Never the real admin:
 * 5 failures lock the username for 15 minutes.
 */
export function getThrottleProbeUser(): UserCredentials {
  return {
    username: generateRandomEmail('throttle.probe'),
    password: 'WrongPass123!',
  };
}

export interface NewLoginUser extends UserCredentials {
  empcode: string;
}

/** Random brand-new user for first-time login tests (TC-LOG-002). */
export function getNewLoginUser(): NewLoginUser {
  const stamp = Date.now().toString().slice(-6);
  return {
    username: generateRandomEmail('e2e.newuser'),
    password: 'Test@12345',
    empcode: `E2E${stamp}`,
  };
}

/** Malformed email (no @) for browser/server validation probes. */
export function getMalformedEmail(): string {
  return 'not-an-email';
}

/** 300+ char email for overlong-input handling. */
export function getOverlongEmail(): string {
  return `${'a'.repeat(290)}@example.com`;
}

/** Real mailbox account used for OTP tests (TC-OTP-*). Verified login account. */
export function getOtpTestEmail(): string {
  return 'harshit.pant@kasturihr.com';
}

/** Random username that must not exist (OTP request must reject). */
export function getUnknownOtpUser(): string {
  return generateRandomEmail('nootpuser');
}

/** Random skill for Skills master tests (TC-SKL-*). */
let sklSeq = 0;
export function getNewSkill(): { name: string } {
  sklSeq += 1;
  return { name: `QA Skill ${Date.now().toString().slice(-6)}-${sklSeq}` };
}

/** Random designation for Employee-prerequisite creation (TC-EMP-*). */
let dsgSeq = 0;
export function getNewDesignation(): { name: string } {
  dsgSeq += 1;
  return { name: `QA Desig ${Date.now().toString().slice(-6)}-${dsgSeq}` };
}

/** Random resolver group for Resolver Group tests (TC-RGP-*). */
export interface NewResolverGroup {
  name: string;
  description: string;
  contact: string;
}
let rgpSeq = 0;
export function getNewResolverGroup(): NewResolverGroup {
  rgpSeq += 1;
  const stamp = `${Date.now().toString().slice(-6)}-${rgpSeq}`;
  return {
    name: `QA RGP ${stamp}`,
    description: 'QA automation resolver group',
    contact: 'qa.rgp@example.com',
  };
}

/** Random domain for Domain master tests (TC-DOM-*). */
export interface NewDomain {
  name: string;
  email: string;
}
let domSeq = 0;
export function getNewDomain(): NewDomain {
  domSeq += 1;
  const stamp = `${Date.now().toString().slice(-6)}-${domSeq}`;
  return {
    name: `QA Dom ${stamp}`,
    email: `qa.dom.${stamp.replace('-', '')}@example.com`,
  };
}

/** Random user type for User Types tests (TC-UTP-*). */
let utpSeq = 0;
export function getNewUserType(): { name: string } {
  utpSeq += 1;
  return { name: `QA UTP ${Date.now().toString().slice(-6)}-${utpSeq}` };
}

/** Random asset for Asset screen tests (TC-AST-*). */
export interface NewAsset {
  serial: string;
  make: string;
  model: string;
  part: string;
  po: string;
  location: string;
}
let astSeq = 0;
export function getNewAsset(): NewAsset {
  astSeq += 1;
  const stamp = `${Date.now().toString().slice(-6)}-${astSeq}`;
  return {
    serial: `QA AST ${stamp}`,
    make: 'QA Make',
    model: `QA Model ${stamp}`,
    part: 'QA Part',
    po: `QAPO${stamp.replace('-', '')}`,
    location: 'QA Location',
  };
}

/** Random incident for Incident screen tests (TC-INC-*). */
let incSeq = 0;
export function getNewIncident(): { problem: string } {
  incSeq += 1;
  return { problem: `QA problem ${Date.now().toString().slice(-6)}-${incSeq}` };
}

/** Random service request for Service Request tests (TC-SRQ-*). */
let srqSeq = 0;
export function getNewServiceRequest(): { problem: string } {
  srqSeq += 1;
  return { problem: `QA SR problem ${Date.now().toString().slice(-6)}-${srqSeq}` };
}

/** Random manufacture for Manufacture tests (TC-MFG-*). */
export function getNewManufacture(): { name: string; description: string } {
  return {
    name: `QA Mfg ${Date.now().toString().slice(-6)}`,
    description: 'QA automation test manufacture',
  };
}

/** Random material type for Material Type master tests (TC-MTP-*). */
let mtpSeq = 0;
export function getNewMaterialType(): { name: string } {
  // Sequence suffix: two back-to-back calls can share the same clock
  // millisecond (slice(-6) collision) — the counter keeps them unique.
  mtpSeq += 1;
  return { name: `QA MTP ${Date.now().toString().slice(-6)}-${mtpSeq}` };
}

/** Random material sub type for Material Sub Type master tests (TC-MST-*). */
let mstSeq = 0;
export function getNewMaterialSubType(): { name: string } {
  mstSeq += 1;
  return { name: `QA MST ${Date.now().toString().slice(-6)}-${mstSeq}` };
}

export interface NewEmployee {
  name: string;
  officialId: string;
  contact: string;
  email: string;
  department: string;
  project: string;
  doj: string;
}

/** Random employee for Employee master tests (TC-EMP-*). */
let empSeq = 0;
export function getNewEmployee(): NewEmployee {
  empSeq += 1;
  const stamp = `${Date.now().toString().slice(-6)}-${empSeq}`;
  return {
    name: `QA Emp ${stamp}`,
    officialId: `QAEMP${stamp.replace('-', '')}`,
    contact: `9${String(100000000 + Math.floor(Math.random() * 899999999))}`,
    email: `qa.emp.${stamp.replace('-', '')}@example.com`,
    department: 'QA Automation',
    project: 'KASSIST',
    doj: '2026-09-30',
  };
}

/** Random product for Product master tests (TC-PRD-*). */
export function getNewProduct(): { name: string; description: string } {
  return {
    name: `QA Product ${Date.now().toString().slice(-6)}`,
    description: 'QA automation test product',
  };
}

/** Random vendor for Vendor master tests (TC-VND-*). */export interface NewVendor {
  name: string;
  code: string;
  address1: string;
  address2: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  pin: string;
}

export function getNewVendor(): NewVendor {
  const stamp = Date.now().toString().slice(-6);
  return {
    name: `QA Vendor ${stamp}`,
    code: `QAV${stamp}`,
    address1: `${stamp} Test Street`,
    address2: 'Noida',
    contactPerson: 'QA Person',
    contactEmail: generateRandomEmail('qavendor'),
    contactPhone: generateRandomPhoneNumber(),
    pin: '201301',
  };
}

/** Random store for Store master tests (TC-STR-*). */
export function getNewStore(): { name: string; description: string } {
  return {
    name: `QA Store ${Date.now().toString().slice(-6)}`,
    description: 'QA automation test store',
  };
}

/** Random store location for Store Location tests (TC-STL-*). */
export function getNewStoreLocation(): { name: string; description: string } {
  return {
    name: `QA StoreLoc ${Date.now().toString().slice(-6)}`,
    description: 'QA automation test store location',
  };
}

/** Random cost centre for Cost Centre tests (TC-CST-*). */
export interface NewCostCentre {
  name: string;
  group: string;
  description: string;
}

export function getNewCostCentre(): NewCostCentre {
  return {
    name: `QA CostCentre ${Date.now().toString().slice(-6)}`,
    group: 'QA Group',
    description: 'QA automation test cost centre',
  };
}

export interface NewProblem {
  title: string;
  description: string;
  status?: string;
  problemType?: string;
  category?: string;
  impact?: 'High' | 'Medium' | 'Low';
  urgency?: 'High' | 'Medium' | 'Low';
  withPeople?: boolean;
  major?: boolean;
}

/** Random problem for Problem Management tests (TC-PRB-*). */
let prbSeq = 0;
export function getNewProblem(overrides: Partial<NewProblem> = {}): NewProblem {
  prbSeq += 1;
  return {
    title: `QA Problem ${Date.now().toString().slice(-6)}-${prbSeq} mail outage`,
    description: 'Recurring mail service outage reported by several users (QA automation).',
    status: 'Open',
    problemType: 'Recurring',
    category: 'Email',
    impact: 'Medium',
    urgency: 'Medium',
    withPeople: true,
    ...overrides,
  };
}
