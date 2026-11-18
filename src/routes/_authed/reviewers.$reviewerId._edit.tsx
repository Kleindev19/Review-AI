
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  Save,
} from "lucide-react";

import { supabase } from "../../lib/supabaseClient";

type Reviewer = {
  id: string;
  title: string;
  subject: string;
  content: string;
};

export default function EditReviewerPage() {
  const { reviewerId } = useParams<{ reviewerId: string }>();
  const navigate = useNavigate();

  const [reviewer, setReviewer] = useState<Reviewer | null>(null);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ==========================================
  // LOAD REVIEWER FROM SUPABASE
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadReviewer() {
      if (!reviewerId) {
        setError("Invalid reviewer ID.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error("Please log in again.");
        }

        const { data, error: databaseError } = await supabase
          .from("reviewers")
          .select("id, title, subject, content")
          .eq("id", reviewerId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (databaseError) {
          throw new Error(databaseError.message);
        }

        if (!data) {
          throw new Error(
            "Reviewer not found or you do not have access to it."
          );
        }

        if (!active) return;

        setReviewer(data);
        setTitle(data.title);
        setSubject(data.subject ?? "");
        setContent(data.content);
      } catch (err) {
        if (!active) return;

        console.error("Failed to load reviewer:", err);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load reviewer."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReviewer();

    return () => {
      active = false;
    };
  }, [reviewerId]);

  // ==========================================
  // UPDATE REVIEWER IN SUPABASE
  // ==========================================

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reviewer || saving) return;

    if (!title.trim()) {
      setError("Reviewer title is required.");
      return;
    }

    if (!content.trim()) {
      setError("Reviewer content cannot be empty.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Please log in again.");
      }

      const { data, error: updateError } = await supabase
        .from("reviewers")
        .update({
          title: title.trim(),
          subject: subject.trim(),
          content: content.trim(),
          updated_date: new Date().toISOString(),
        })
        .eq("id", reviewer.id)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (!data) {
        throw new Error(
          "Reviewer could not be updated. It may have been deleted."
        );
      }

      // Return to Supabase-connected reviewers library
      navigate("/reviewers", { replace: true });
    } catch (err) {
      console.error("Failed to update reviewer:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to update reviewer."
      );
    } finally {
      setSaving(false);
    }
  }

  // ==========================================
  // LOADING STATE
  // ==========================================

  if (loading) {
    return (
      <div className="flex min-h-[350px] flex-col items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Loading reviewer...
        </p>
      </div>
    );
  }

  // ==========================================
  // ERROR / NOT FOUND
  // ==========================================

  if (!reviewer) {
    return (
      <div className="flex min-h-[350px] flex-col items-center justify-center px-4 text-center">
        <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />

        <h1 className="text-xl font-semibold text-foreground">
          Reviewer unavailable
        </h1>

        <p role="alert" className="mt-2 max-w-md text-sm text-muted-foreground">
          {error || "This reviewer could not be found."}
        </p>

        <Link to="/reviewers" className="btn btn-primary mt-6">
          <ArrowLeft className="h-4 w-4" />
          Back to reviewers
        </Link>
      </div>
    );
  }

  // ==========================================
  // EDIT PAGE
  // ==========================================

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <header>
        <Link
          to="/reviewers"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to reviewers
        </Link>

        <h1 className="text-[26px] font-semibold text-foreground">
          Edit Reviewer
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Update your reviewer and save the changes to your StudyRoom account.
        </p>
      </header>

      {/* EDIT FORM */}
      <form onSubmit={handleSave} className="panel space-y-5 p-5 sm:p-6">

        <div className="grid gap-4 sm:grid-cols-2">
          {/* TITLE */}
          <label className="block">
            <span className="label-xs mb-1.5 block">
              Reviewer Title
            </span>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Reviewer title"
              className="input"
              required
            />
          </label>

          {/* SUBJECT */}
          <label className="block">
            <span className="label-xs mb-1.5 block">
              Subject
            </span>

            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="e.g. Biology"
              className="input"
            />
          </label>
        </div>

        {/* CONTENT */}
        <label className="block">
          <span className="label-xs mb-1.5 block">
            Reviewer Content
          </span>

          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={18}
            placeholder="Reviewer content..."
            className="textarea font-mono text-[13px] leading-relaxed"
            required
          />
        </label>

        {/* ERROR MESSAGE */}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
          <Link to="/reviewers" className="btn btn-secondary">
            Cancel
          </Link>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            {saving ? "Saving changes..." : "Save Changes"}
          </button>
        </div>

      </form>
    </div>
  );
}
