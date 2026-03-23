CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anchor_id UUID NOT NULL,
  content TEXT NOT NULL,
  highlighted_text TEXT,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_page_id ON comments(page_id);
CREATE INDEX idx_comments_page_id_created ON comments(page_id, created_at DESC);
CREATE INDEX idx_comments_anchor_id ON comments(anchor_id);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
