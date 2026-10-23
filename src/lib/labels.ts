import type { Basis, Category, Location, PhotoKind, Status } from '../db/types';

export const CATEGORY_LABELS: Record<Category, string> = {
  malarstwo: 'Malarstwo',
  rysunek: 'Rysunek',
  grafika: 'Grafika',
  fotografia: 'Fotografia',
  rzezba: 'Rzeźba',
  ceramika: 'Ceramika',
  szklo: 'Szkło',
  bizuteria_rzemioslo: 'Biżuteria / rzemiosło',
};

export const STATUS_LABELS: Record<Status, string> = {
  dostepne: 'Dostępne',
  w_magazynie: 'W magazynie',
  zarezerwowane: 'Zarezerwowane',
  sprzedane: 'Sprzedane',
};

export const LOCATION_LABELS: Record<Location, string> = {
  sala_wystawowa: 'Sala wystawowa',
  magazyn: 'Magazyn',
};

export const BASIS_LABELS: Record<Basis, string> = {
  wlasnosc: 'Własność galerii',
  komis: 'Komis',
};

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  przod: 'Przód',
  tyl: 'Tył',
  sygnatura: 'Sygnatura',
  detal: 'Detal',
  inne: 'Inne',
  certyfikat: 'Certyfikat',
};

export function entries<K extends string>(labels: Record<K, string>): [K, string][] {
  return Object.entries(labels) as [K, string][];
}
