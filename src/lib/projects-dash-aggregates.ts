// Aggregation for the project dash (`/proyectos` → dash tab).
//
// The dash used to receive every registro, encuesta and grupo of the project and
// reduce them in the browser. On a large project that response reached ~48 MB
// and the transfer aborted, leaving the whole dash empty. The reductions now run
// here, next to the database, so the browser only receives the results.
//
// The functions below are deliberately a port of the ones that lived in the
// route component: same normalization, same sort order, same colors, so the
// rendered output does not change.
import type { JsonValue } from './projects-dashboard-server';

export const CHART_COLORS = [
  '#f59e0b',
  '#f97316',
  '#0f766e',
  '#0284c7',
  '#be123c',
  '#7c3aed',
  '#65a30d',
  '#b45309',
] as const;

// A distribution with hundreds of distinct values is unreadable as a chart and
// would put the payload back where it started, so only the head is sent.
const MAX_DISTRIBUTION_VALUES = 50;

export const ORIGIN_BASE_DEFAULT_KEY = '__origen__';

export type DashChartDatum = {
  label: string;
  value: number;
  share: number;
  color: string;
};

export type DashOriginScore = {
  label: string;
  average: number;
  count: number;
};

export type DashDailyPoint = {
  dateKey: string;
  registros: number;
  encuestas: number;
  grupos: number;
};

export type DashDailyOriginItem = {
  origin: string;
  registros: number;
  encuestas: number;
  grupos: number;
};

export type DashSurveyCard = {
  answered: number;
  total: number;
  values: DashChartDatum[];
};

export type ProjectDashMetrics = {
  dateStart: string;
  dateEnd: string;
  totals: {
    registros: number;
    encuestas: number;
    grupos: number;
    uniqueEmails: number;
    withPhone: number;
    origins: number;
    uniquePhones: number;
    coveredPhones: number;
  };
  range: {
    registros: number;
    encuestas: number;
    grupos: number;
    uniquePhones: number;
    coveredPhones: number;
  };
  topOrigins: Array<[string, number]>;
  origins: string[];
  /** Origins whose registros match the organic campaign rule, for the daily filter. */
  organicOrigins: string[];
  metadataKeys: string[];
  surveyKeys: string[];
  /** Range-scoped registro distributions, keyed by `__origen__` or a metadata key. */
  distributions: Record<string, DashChartDatum[]>;
  surveyCards: Record<string, DashSurveyCard>;
  score: {
    average: number | null;
    scoredCount: number;
    byBaseKey: Record<string, DashOriginScore[]>;
  };
  daily: DashDailyPoint[];
  dailyByOrigin: Array<{ dateKey: string; items: DashDailyOriginItem[] }>;
  /** Which "origen base" the daily breakdown above is keyed by. */
  dailyOriginBaseKey: string;
};

export function isPlainObject(value: JsonValue | unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function formatMetadataValue(value: JsonValue | unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => formatMetadataValue(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function hasResponseValue(value: JsonValue | unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasResponseValue(item));
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

export function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Argentina numbers arrive both as `54…` and `549…`; treat them as one phone
  // so the coverage between registros and grupos matches.
  if (digits.startsWith('549')) return `54${digits.slice(3)}`;

  return digits;
}

function readMetadataString(metadata: JsonValue | unknown, key: string) {
  if (!isPlainObject(metadata)) return '';
  return formatMetadataValue(metadata[key]).trim();
}

export function isOrganicCampaign(metadata: JsonValue | unknown) {
  return /(?:0526DI|0926DI)/i.test(readMetadataString(metadata, 'utm_campaign'));
}

function toChartData(totals: Map<string, number>): DashChartDatum[] {
  let total = 0;
  for (const value of totals.values()) total += value;
  if (total === 0) return [];

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_DISTRIBUTION_VALUES)
    .map(([label, value], index) => ({
      label,
      value,
      share: value / total,
      color: CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0],
    }));
}

function bump(totals: Map<string, number>, label: string) {
  totals.set(label, (totals.get(label) ?? 0) + 1);
}

function nested<K, T>(map: Map<K, T>, key: K, create: () => T): T {
  const current = map.get(key);
  if (current) return current;
  const next = create();
  map.set(key, next);
  return next;
}

export type RegistroBaseRow = {
  id: number;
  correo: string;
  telefono: string | null;
  origen: string;
  /**
   * Value of the selected "origen base" for this registro, already extracted by
   * the caller. Null when the base key is `__origen__` (then `origen` is used)
   * or when the metadata has no value for that key.
   */
  baseOrigin: string | null;
  dateKey: string;
  inRange: boolean;
};

export type RegistroDetailRow = {
  id: number;
  origen: string;
  metadata: JsonValue | unknown;
  dateKey: string;
};

export type EncuestaBaseRow = {
  contactId: string;
  score: number | null;
  dateKey: string;
  inRange: boolean;
};

export type GrupoBaseRow = {
  telefono: string;
  dateKey: string;
  inRange: boolean;
};

type DailyCounters = { registros: number; encuestas: number; grupos: number };
type ScoreTotals = { total: number; count: number };

// Matches `es.projects.originBaseDefault`, the label the dash shows for a row
// with an empty `origen`.
const ORIGIN_FALLBACK_LABEL = 'Origen';

/**
 * Folds the project rows into the dash payload. Rows are pushed in batches by
 * the caller so no query result is ever held whole in memory.
 */
export function createDashAggregator(
  dateStart: string,
  dateEnd: string,
  originBaseKey: string = ORIGIN_BASE_DEFAULT_KEY,
) {
  // The daily breakdown groups by the dash's "origen base" selector. With the
  // default key that is `registros.origen`; with a metadata key it is the value
  // the caller extracted for that key, so a project whose platform lives in
  // `utm_source` can read its daily series per platform.
  const usesMetadataBase = originBaseKey !== ORIGIN_BASE_DEFAULT_KEY;

  const emails = new Set<string>();
  const originCounts = new Map<string, number>();
  const organicOrigins = new Set<string>();
  const registroPhones = new Set<string>();
  const rangeRegistroPhones = new Set<string>();
  const grupoPhones = new Set<string>();
  const rangeGrupoPhones = new Set<string>();
  // `originById` stays on `registros.origen` because the score-by-origin card
  // reads it for the default base key. The daily lookups follow the selected
  // base key instead, and are the same map when that key is the default.
  const originById = new Map<string, string>();
  const dailyOriginById = usesMetadataBase ? new Map<string, string>() : originById;
  const dailyOriginByPhone = new Map<string, string>();
  const rangeRegistroIds = new Set<string>();
  const scoreByContact = new Map<string, ScoreTotals>();
  const daily = new Map<string, DailyCounters>();
  const dailyByOrigin = new Map<string, Map<string, DailyCounters>>();
  const distributions = new Map<string, Map<string, number>>();
  const surveyTotals = new Map<string, Map<string, number>>();
  const surveyAnswered = new Map<string, number>();
  const scoreByBaseKey = new Map<string, Map<string, ScoreTotals>>();
  const metadataKeys = new Set<string>();
  const surveyKeys = new Set<string>();

  let totalRegistros = 0;
  let totalEncuestas = 0;
  let totalGrupos = 0;
  let withPhone = 0;
  let rangeRegistros = 0;
  let rangeEncuestas = 0;
  let rangeGrupos = 0;
  let rangeSurveyRows = 0;
  let scoreSum = 0;
  let scoredCount = 0;

  const dayCounters = (dateKey: string) =>
    nested(daily, dateKey, () => ({ registros: 0, encuestas: 0, grupos: 0 }));

  const originCounters = (dateKey: string, origin: string) =>
    nested(
      nested(dailyByOrigin, dateKey, () => new Map<string, DailyCounters>()),
      origin,
      () => ({ registros: 0, encuestas: 0, grupos: 0 }),
    );

  return {
    // Pass 1: registros without the metadata column — cheap, and it seeds the
    // id/phone → origin lookups the other passes need. With a metadata origen
    // base the caller adds `baseOrigin`, one extracted value per row, so this
    // pass stays as light as it was.
    addRegistroBase(row: RegistroBaseRow) {
      totalRegistros += 1;

      const email = row.correo.trim().toLowerCase();
      if (email) emails.add(email);
      if (row.telefono?.trim()) withPhone += 1;

      const origin = row.origen.trim() || ORIGIN_FALLBACK_LABEL;
      // A registro with no value for the selected metadata key is not a group of
      // its own: it is left out of the breakdown, the same way the metadata
      // distributions skip empty labels.
      const dailyOrigin = usesMetadataBase ? (row.baseOrigin ?? '').trim() : origin;

      bump(originCounts, row.origen);
      originById.set(String(row.id), origin);
      if (usesMetadataBase && dailyOrigin) dailyOriginById.set(String(row.id), dailyOrigin);

      const phone = normalizePhone(row.telefono);
      if (phone) {
        registroPhones.add(phone);
        if (dailyOrigin && !dailyOriginByPhone.has(phone))
          dailyOriginByPhone.set(phone, dailyOrigin);
      }

      if (!row.inRange) return;

      rangeRegistros += 1;
      rangeRegistroIds.add(String(row.id));
      if (phone) rangeRegistroPhones.add(phone);
      dayCounters(row.dateKey).registros += 1;
      if (dailyOrigin) originCounters(row.dateKey, dailyOrigin).registros += 1;
    },

    addEncuestaBase(row: EncuestaBaseRow) {
      totalEncuestas += 1;
      if (!row.inRange) return;

      rangeEncuestas += 1;
      dayCounters(row.dateKey).encuestas += 1;

      const contactId = row.contactId;
      const origin = originById.get(contactId);
      const dailyOrigin = dailyOriginById.get(contactId);
      if (dailyOrigin) originCounters(row.dateKey, dailyOrigin).encuestas += 1;

      // The score only counts when the answering lead is itself inside the range,
      // which is how the dash has always read this metric.
      if (row.score === null) return;
      if (!rangeRegistroIds.has(contactId)) return;

      scoreSum += row.score;
      scoredCount += 1;

      const totals = nested(scoreByContact, contactId, () => ({ total: 0, count: 0 }));
      totals.total += row.score;
      totals.count += 1;

      if (origin) {
        const byOrigin = nested(scoreByBaseKey, ORIGIN_BASE_DEFAULT_KEY, () => new Map());
        const entry = nested(byOrigin, origin, () => ({ total: 0, count: 0 }));
        entry.total += row.score;
        entry.count += 1;
      }
    },

    addGrupoBase(row: GrupoBaseRow) {
      totalGrupos += 1;

      const phone = normalizePhone(row.telefono);
      if (phone) grupoPhones.add(phone);

      if (!row.inRange) return;

      rangeGrupos += 1;
      if (phone) rangeGrupoPhones.add(phone);
      dayCounters(row.dateKey).grupos += 1;

      const origin = phone ? dailyOriginByPhone.get(phone) : undefined;
      if (origin) originCounters(row.dateKey, origin).grupos += 1;
    },

    // Pass 2: registros in range with metadata. Distributions and score-by-origin
    // for metadata-based groupings are folded here, so no metadata is ever kept
    // per row.
    addRegistroDetail(row: RegistroDetailRow) {
      const origin = row.origen.trim();
      const scores = scoreByContact.get(String(row.id));

      const addTo = (baseKey: string, label: string) => {
        if (!label) return;
        bump(
          nested(distributions, baseKey, () => new Map()),
          label,
        );
        if (!scores) return;
        const byLabel = nested(scoreByBaseKey, baseKey, () => new Map());
        const entry = nested(byLabel, label, () => ({ total: 0, count: 0 }));
        entry.total += scores.total;
        entry.count += scores.count;
      };

      // `__origen__` distribution only; its score breakdown is accumulated from
      // the encuestas pass, which already knows each lead's origin.
      if (origin) {
        bump(
          nested(distributions, ORIGIN_BASE_DEFAULT_KEY, () => new Map()),
          origin,
        );
      }

      if (isOrganicCampaign(row.metadata)) organicOrigins.add(row.origen);
      if (!isPlainObject(row.metadata)) return;

      for (const [key, value] of Object.entries(row.metadata)) {
        metadataKeys.add(key);
        addTo(key, formatMetadataValue(value).trim());
      }
    },

    // Pass 3: encuestas in range with their answers.
    addEncuestaDetail(respuestas: JsonValue | unknown) {
      rangeSurveyRows += 1;
      if (!isPlainObject(respuestas)) return;

      for (const [key, value] of Object.entries(respuestas)) {
        surveyKeys.add(key);
        if (!hasResponseValue(value)) continue;
        surveyAnswered.set(key, (surveyAnswered.get(key) ?? 0) + 1);
        const label = formatMetadataValue(value).trim();
        if (label)
          bump(
            nested(surveyTotals, key, () => new Map()),
            label,
          );
      }
    },

    finish(): ProjectDashMetrics {
      let coveredPhones = 0;
      for (const phone of registroPhones) {
        if (grupoPhones.has(phone)) coveredPhones += 1;
      }

      let rangeCoveredPhones = 0;
      for (const phone of rangeRegistroPhones) {
        if (rangeGrupoPhones.has(phone)) rangeCoveredPhones += 1;
      }

      const distributionsOut: Record<string, DashChartDatum[]> = {};
      for (const [key, totals] of distributions) distributionsOut[key] = toChartData(totals);

      const surveyCards: Record<string, DashSurveyCard> = {};
      for (const key of surveyKeys) {
        const answered = surveyAnswered.get(key) ?? 0;
        const totals = surveyTotals.get(key) ?? new Map<string, number>();
        surveyCards[key] = {
          answered,
          total: rangeSurveyRows,
          values: answered === 0 ? [] : toChartData(totals),
        };
      }

      const scoreOut: Record<string, DashOriginScore[]> = {};
      for (const [baseKey, byLabel] of scoreByBaseKey) {
        scoreOut[baseKey] = Array.from(byLabel.entries())
          .map(([label, totals]) => ({
            label,
            average: totals.count > 0 ? totals.total / totals.count : 0,
            count: totals.count,
          }))
          .sort(
            (a, b) => b.average - a.average || b.count - a.count || a.label.localeCompare(b.label),
          );
      }

      const dailyOut = Array.from(daily.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dateKey, counters]) => ({ dateKey, ...counters }));

      const dailyByOriginOut = Array.from(dailyByOrigin.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dateKey, origins]) => ({
          dateKey,
          items: Array.from(origins.entries())
            .map(([origin, counters]) => ({ origin, ...counters }))
            .sort(
              (a, b) =>
                b.registros + b.encuestas + b.grupos - (a.registros + a.encuestas + a.grupos) ||
                a.origin.localeCompare(b.origin),
            ),
        }));

      return {
        dateStart,
        dateEnd,
        totals: {
          registros: totalRegistros,
          encuestas: totalEncuestas,
          grupos: totalGrupos,
          uniqueEmails: emails.size,
          withPhone,
          origins: originCounts.size,
          uniquePhones: registroPhones.size,
          coveredPhones,
        },
        range: {
          registros: rangeRegistros,
          encuestas: rangeEncuestas,
          grupos: rangeGrupos,
          uniquePhones: rangeRegistroPhones.size,
          coveredPhones: rangeCoveredPhones,
        },
        topOrigins: Array.from(originCounts.entries()).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        ),
        origins: Array.from(originCounts.keys()).sort((a, b) => a.localeCompare(b)),
        organicOrigins: Array.from(organicOrigins).sort((a, b) => a.localeCompare(b)),
        metadataKeys: Array.from(metadataKeys).sort((a, b) => a.localeCompare(b)),
        surveyKeys: Array.from(surveyKeys).sort((a, b) => a.localeCompare(b)),
        distributions: distributionsOut,
        surveyCards,
        score: {
          average: scoredCount > 0 ? scoreSum / scoredCount : null,
          scoredCount,
          byBaseKey: scoreOut,
        },
        daily: dailyOut,
        dailyByOrigin: dailyByOriginOut,
        dailyOriginBaseKey: originBaseKey,
      };
    },
  };
}
