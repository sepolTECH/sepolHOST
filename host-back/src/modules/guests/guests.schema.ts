import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  isBrazil,
  isValidCnpj,
  isValidCpf,
  isValidForeignDocument,
  isValidRg,
  normalizeDocument,
  normalizePhone,
  normalizeRg,
  onlyDigits,
  UFS,
} from '../../utils/documents.js';

/** Texto opcional: vazio vira null no banco. */
const optionalText = (max: number, message = 'Texto muito longo') =>
  z.string().trim().max(max, message).optional().default('');

const emailValidator = z.email();

export const guestSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Informe o nome completo').max(160, 'Nome muito longo'),
    personType: z.enum(['PF', 'PJ'], { message: 'Informe se é pessoa física ou jurídica' }),
    isForeign: z.boolean().optional().default(false),
    nationality: optionalText(80, 'Nacionalidade muito longa'),
    documentType: z.enum(DOCUMENT_TYPES, { message: 'Informe o tipo de identificação' }),
    documentNumber: z.string().trim().min(1, 'Informe o número de identificação').max(30),
    rg: optionalText(20, 'RG inválido'),
    email: optionalText(160, 'E-mail muito longo'),
    phone: z.string().trim().min(1, 'Informe o telefone').max(25),

    addressZip: optionalText(12, 'CEP inválido'),
    addressStreet: optionalText(160, 'Endereço muito longo'),
    addressNumber: optionalText(20, 'Número muito longo'),
    addressComplement: optionalText(80, 'Complemento muito longo'),
    addressDistrict: optionalText(80, 'Bairro muito longo'),
    addressCity: optionalText(80, 'Cidade muito longa'),
    addressState: optionalText(40, 'Estado muito longo'),
    addressCountry: optionalText(80, 'País muito longo'),

    notes: optionalText(2000, 'Observações muito longas (máx. 2000 caracteres)'),
  })
  .superRefine((g, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    const foreign = g.personType === 'PF' && g.isForeign;

    // PJ: CNPJ | PF brasileiro: CPF | PF estrangeiro: passaporte ou DNI
    if (g.personType === 'PJ' && g.documentType !== 'CNPJ') issue('documentType', 'Pessoa jurídica deve usar CNPJ');
    if (g.personType === 'PF' && !foreign && g.documentType !== 'CPF') issue('documentType', 'Hóspede brasileiro usa CPF');
    if (foreign && g.documentType !== 'PASSAPORTE' && g.documentType !== 'DNI')
      issue('documentType', 'Hóspede estrangeiro usa passaporte ou DNI');

    if (foreign && g.nationality.length < 2) issue('nationality', 'Informe a nacionalidade');

    if (g.documentType === 'CPF' && !isValidCpf(g.documentNumber)) issue('documentNumber', 'CPF inválido');
    if (g.documentType === 'CNPJ' && !isValidCnpj(g.documentNumber)) issue('documentNumber', 'CNPJ inválido');
    if ((g.documentType === 'PASSAPORTE' || g.documentType === 'DNI') && !isValidForeignDocument(g.documentNumber))
      issue('documentNumber', `${g.documentType === 'DNI' ? 'DNI' : 'Passaporte'} deve ter de 5 a 20 letras/números`);

    if (g.rg && !isValidRg(g.rg)) issue('rg', 'RG deve ter de 5 a 14 letras/números');
    if (g.email && !emailValidator.safeParse(g.email).success) issue('email', 'E-mail inválido');

    const phoneDigits = onlyDigits(g.phone).length;
    if (phoneDigits < 10 || phoneDigits > 15) issue('phone', 'Telefone inválido (inclua o DDD)');

    const brAddress = !g.addressCountry || isBrazil(g.addressCountry);
    if (brAddress && g.addressZip && onlyDigits(g.addressZip).length !== 8) issue('addressZip', 'CEP inválido');
    if (brAddress && g.addressState && !UFS.includes(g.addressState.toUpperCase())) issue('addressState', 'UF inválida');
  })
  .transform((g) => {
    const isForeign = g.personType === 'PF' && g.isForeign;
    const brAddress = !g.addressCountry || isBrazil(g.addressCountry);
    const hasAddress = [
      g.addressZip,
      g.addressStreet,
      g.addressNumber,
      g.addressComplement,
      g.addressDistrict,
      g.addressCity,
      g.addressState,
    ].some(Boolean);
    const orNull = (v: string) => v || null;

    return {
      fullName: g.fullName.replace(/\s+/g, ' '),
      personType: g.personType,
      isForeign,
      nationality: isForeign ? g.nationality : 'Brasileira',
      documentType: g.documentType,
      documentNumber: normalizeDocument(g.documentType, g.documentNumber),
      // RG só faz sentido para pessoa física brasileira
      rg: g.personType === 'PF' && !isForeign && g.rg ? normalizeRg(g.rg) : null,
      email: g.email ? g.email.toLowerCase() : null,
      phone: normalizePhone(g.phone),

      addressZip: g.addressZip ? (brAddress ? onlyDigits(g.addressZip) : g.addressZip.toUpperCase()) : null,
      addressStreet: orNull(g.addressStreet),
      addressNumber: orNull(g.addressNumber),
      addressComplement: orNull(g.addressComplement),
      addressDistrict: orNull(g.addressDistrict),
      addressCity: orNull(g.addressCity),
      addressState: g.addressState ? (brAddress ? g.addressState.toUpperCase() : g.addressState) : null,
      addressCountry: hasAddress ? g.addressCountry || 'Brasil' : null,

      notes: orNull(g.notes),
    };
  });

export type GuestInput = z.infer<typeof guestSchema>;

export const checkDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES, { message: 'Informe o tipo de identificação' }),
  documentNumber: z.string().trim().min(1, 'Informe o número de identificação').max(30),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(''),
  personType: z.enum(['PF', 'PJ']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
