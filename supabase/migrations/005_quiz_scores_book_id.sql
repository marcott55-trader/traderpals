alter table quiz_scores add column if not exists book_id int;
create index if not exists idx_quiz_scores_book on quiz_scores (book_id);
