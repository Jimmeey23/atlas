# Importing source content into monthly reports

Open **Atlas AI → Import content** in the monthly report reader or preview. Unlock report editing, paste text/HTML/JSON or attach one PDF, DOCX, HTML, JSON or TXT file. Add optional instructions and select a destination chapter/section, or let AI place each element in a relevant existing chapter.

Choose **Process content** to preview proposed text, tables, charts, metric cards and heatmaps. Review the data, reporting period, units and source excerpt on each element. **Apply changes** inserts the elements; **Undo last AI edit** reverses that application if no later edits have occurred. Use the report's **Save** action to persist the version.

Files are limited to 3 MB and extracted content to 120,000 characters. PDFs require a text layer; scanned/image-only documents need OCR before import. A request can generate up to 12 elements, each with up to 500 rows and 20 columns. Uploaded values are copied as stated, with no inferred calculations or unit conversions. Numeric validation checks values against each exact supporting excerpt; users should still review labels, populations, units and interpretation before applying.

Imported elements retain the source name, an extracted-content SHA-256 fingerprint, import timestamp and source excerpt. Their data is stored inside the report snapshot, separately from frozen governed studio datasets. They do not overwrite official chapter totals. Existing report editing authorization, stale-plan protection, saving and undo apply to imports.

The authenticated `/api/reports/import-content` endpoint performs extraction, structured AI generation, destination validation and evidence checks. Original uploaded files are processed in memory; only the evidence retained by generated elements is saved with the report. Source document text is sent to the configured AI provider for processing.
