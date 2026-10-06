alter table public.p57_documents drop constraint if exists p57_documents_page_check;
alter table public.p57_documents add constraint p57_documents_page_check check (page between 0 and 15);
