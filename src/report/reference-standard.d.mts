export function setReferenceTemplates(value: unknown): void;
import type { ReportModel } from './model';
export interface ReferenceSectionTemplate { id: string; anchor: string; title: string; words: number; subheadings: string[]; tableHeaders: string[][]; charts: number; layout: string; dynamicTitle: boolean }
export interface ReferenceTemplate { id: string; title: string; sha256: string; filename: string; bodyWords: number; css: string; coverHtml: string; coverTitle: string; sections: ReferenceSectionTemplate[] }
export interface ReferenceReview { version: 1; templateHash: string; sections: { id: string; html: string; verified: boolean }[] }
export const REFERENCE_FORMAT: 'reference-v1';
export const REFERENCE_CHAPTERS: string[];
export function referenceTemplate(id: string, month?: string): ReferenceTemplate | undefined;
export function htmlText(html: string): string;
export function wordCount(html: string): number;
export function referenceSectionIssues(html: string, template: ReferenceTemplate, section: ReferenceSectionTemplate, options?: { length?: boolean; draft?: boolean; words?: number }): string[];
export function referenceReviewIssues(review: ReferenceReview | undefined, chapter: string, options?: { length?: boolean; month?: string; model?: ReportModel }): string[];
export interface ReferenceLengthEdit { id: string; nodeIndex: number; text: string; words: number }
export function referenceWordBudgets(model: ReportModel, chapter: string): number[];
export function referenceLengthPlan(html: string, target: number): ReferenceLengthEdit[];
export function applyReferenceLength(html: string, plan: ReferenceLengthEdit[], replacements: Record<string, string[]>, target: number): string;
export function referenceDocument(model: ReportModel, chapterIds?: string[]): string;
export function escapeReferenceText(value: unknown): string;
