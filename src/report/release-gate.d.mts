import type { ReportModel } from './model';
export function reportReleaseIssues(report: ReportModel): string[];
export function assertReportRelease(report: ReportModel): void;
export function assertRenderedReport(element: HTMLElement): void;
