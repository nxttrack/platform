"use client";

import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, type JSONContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Undo2,
  Unlink
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type RichTextEditorVariable = {
  description?: string;
  label: string;
  value: string;
};

type RichTextEditorProps = {
  className?: string;
  description?: string;
  disabled?: boolean;
  initialHtml?: string;
  initialJson?: JSONContent | null;
  label?: string;
  nameHtml?: string;
  nameJson?: string;
  placeholder?: string;
  required?: boolean;
  variables?: RichTextEditorVariable[];
};

export function RichTextEditor({
  className,
  description,
  disabled = false,
  initialHtml = "",
  initialJson,
  label = "Inhoud",
  nameHtml = "contentHtml",
  nameJson = "contentJson",
  placeholder = "Schrijf een helder bericht…",
  required = false,
  variables = []
}: RichTextEditorProps) {
  const editorId = useId();
  const descriptionId = useId();
  const linkInputId = useId();
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const initialContent = initialJson ?? initialHtml;
  const [contentJson, setContentJson] = useState(() =>
    initialJson ? JSON.stringify(initialJson) : ""
  );
  const [contentHtml, setContentHtml] = useState(initialHtml);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit,
      LinkExtension.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false
      }),
      Placeholder.configure({ placeholder })
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        ...(description ? { "aria-describedby": descriptionId } : {}),
        "aria-labelledby": editorId,
        "aria-multiline": "true",
        "aria-required": String(required),
        class:
          "min-h-56 px-4 py-3 text-sm leading-7 text-foreground outline-none " +
          "[&_a]:font-medium [&_a]:text-primary [&_a]:underline " +
          "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 " +
          "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 " +
          "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 " +
          "[&_.is-editor-empty:first-child::before]:pointer-events-none " +
          "[&_.is-editor-empty:first-child::before]:float-left " +
          "[&_.is-editor-empty:first-child::before]:h-0 " +
          "[&_.is-editor-empty:first-child::before]:text-muted-foreground " +
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
        role: "textbox"
      }
    },
    onCreate: ({ editor: currentEditor }) => {
      setContentJson(JSON.stringify(currentEditor.getJSON()));
      setContentHtml(currentEditor.getHTML());
      initializedRef.current = true;
    },
    onUpdate: ({ editor: currentEditor }) => {
      setContentJson(JSON.stringify(currentEditor.getJSON()));
      setContentHtml(currentEditor.getHTML());

      if (initializedRef.current) {
        requestAnimationFrame(() => {
          jsonInputRef.current?.dispatchEvent(
            new Event("input", { bubbles: true })
          );
        });
      }
    }
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function openLinkEditor() {
    setLinkHref(String(editor?.getAttributes("link").href ?? ""));
    setLinkOpen(true);
  }

  function applyLink() {
    const href = normalizeLinkHref(linkHref);

    if (!editor || !href) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  function insertVariable(value: string) {
    editor?.chain().focus().insertContent(value).run();
  }

  return (
    <Field className={className}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <FieldLabel id={editorId}>
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </FieldLabel>
          {description ? (
            <FieldDescription id={descriptionId}>
              {description}
            </FieldDescription>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">
          Rijke tekst met veilige opmaak
        </span>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-background shadow-soft transition",
          "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30",
          disabled && "cursor-not-allowed bg-muted/50 opacity-70"
        )}
      >
        <div
          aria-label="Tekstopmaak"
          className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/45 p-2"
          role="toolbar"
        >
          <ToolbarButton
            active={editor?.isActive("bold")}
            disabled={disabled || !editor?.can().chain().focus().toggleBold().run()}
            icon={<Bold aria-hidden="true" className="size-4" />}
            label="Vet"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            active={editor?.isActive("italic")}
            disabled={
              disabled || !editor?.can().chain().focus().toggleItalic().run()
            }
            icon={<Italic aria-hidden="true" className="size-4" />}
            label="Cursief"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          />
          <ToolbarButton
            active={editor?.isActive("bulletList")}
            disabled={
              disabled ||
              !editor?.can().chain().focus().toggleBulletList().run()
            }
            icon={<List aria-hidden="true" className="size-4" />}
            label="Opsomming"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            active={editor?.isActive("orderedList")}
            disabled={
              disabled ||
              !editor?.can().chain().focus().toggleOrderedList().run()
            }
            icon={<ListOrdered aria-hidden="true" className="size-4" />}
            label="Genummerde lijst"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          />

          <span
            aria-hidden="true"
            className="mx-1 h-6 w-px bg-border"
          />

          <Popover onOpenChange={setLinkOpen} open={linkOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-label="Link toevoegen of wijzigen"
                aria-pressed={editor?.isActive("link") ?? false}
                disabled={disabled || !editor}
                onClick={openLinkEditor}
                size="icon"
                type="button"
                variant={editor?.isActive("link") ? "secondary" : "ghost"}
              >
                <Link2 aria-hidden="true" className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-80 gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Link instellen
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Selecteer eerst de linktekst en vul daarna een veilig
                  webadres in.
                </p>
              </div>
              <Field>
                <FieldLabel htmlFor={linkInputId}>Webadres</FieldLabel>
                <Input
                  autoFocus
                  id={linkInputId}
                  inputMode="url"
                  onChange={(event) => setLinkHref(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyLink();
                    }
                  }}
                  placeholder="https://voorbeeld.nl"
                  value={linkHref}
                />
              </Field>
              <div className="flex flex-wrap justify-end gap-2">
                {editor?.isActive("link") ? (
                  <Button onClick={removeLink} type="button" variant="outline">
                    <Unlink aria-hidden="true" className="size-4" />
                    Link verwijderen
                  </Button>
                ) : null}
                <Button
                  disabled={!normalizeLinkHref(linkHref)}
                  onClick={applyLink}
                  type="button"
                >
                  Link toepassen
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <span
            aria-hidden="true"
            className="mx-1 h-6 w-px bg-border"
          />

          <ToolbarButton
            disabled={disabled || !editor?.can().chain().focus().undo().run()}
            icon={<Undo2 aria-hidden="true" className="size-4" />}
            label="Ongedaan maken"
            onClick={() => editor?.chain().focus().undo().run()}
          />
          <ToolbarButton
            disabled={disabled || !editor?.can().chain().focus().redo().run()}
            icon={<Redo2 aria-hidden="true" className="size-4" />}
            label="Opnieuw uitvoeren"
            onClick={() => editor?.chain().focus().redo().run()}
          />
        </div>

        <EditorContent editor={editor} />
      </div>

      {variables.length > 0 ? (
        <div aria-label="Beschikbare variabelen" className="grid gap-2">
          <p className="text-xs font-semibold text-foreground">
            Variabele invoegen
          </p>
          <div className="flex flex-wrap gap-2">
            {variables.map((variable) => (
              <Button
                aria-label={`Variabele ${variable.label} invoegen`}
                disabled={disabled || !editor}
                key={variable.value}
                onClick={() => insertVariable(variable.value)}
                title={variable.description}
                type="button"
                variant="outline"
              >
                <code className="text-xs">{variable.value}</code>
                <span className="sr-only">{variable.label}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border bg-muted/45 px-4 py-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview met testdata</p>
        </div>
        <div
          aria-live="polite"
          className="prose prose-sm max-w-none px-4 py-4 text-foreground [&_a]:text-primary"
          dangerouslySetInnerHTML={{ __html: renderEditorPreview(contentHtml) || "<p class=\"text-muted-foreground\">De preview verschijnt zodra je inhoud invoert.</p>" }}
        />
      </div>

      <input
        name={nameJson}
        readOnly
        ref={jsonInputRef}
        type="hidden"
        value={contentJson}
      />
      <input name={nameHtml} readOnly type="hidden" value={contentHtml} />
    </Field>
  );
}

const previewValues: Record<string, string> = {
  parent_name: "Sam de Vries",
  child_name: "Noa de Vries",
  program_name: "Zwem-ABC",
  stage_name: "Badje 2",
  group_name: "Dolfijnen dinsdag",
  lesson_date: "dinsdag 4 augustus",
  lesson_time: "17:30",
  instructor_name: "Sanne Vermeer",
  payment_link: "https://voorbeeld.test/betalen",
  portal_link: "https://voorbeeld.test/portaal",
  tenant_name: "Zwemacademie De Waterlijn"
};

function renderEditorPreview(html: string) {
  return html.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (token, key: string) =>
    previewValues[key] ?? token
  );
}

function ToolbarButton({
  active,
  disabled,
  icon,
  label,
  onClick
}: {
  active?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      disabled={disabled}
      onClick={onClick}
      size="icon"
      type="button"
      variant={active ? "secondary" : "ghost"}
    >
      {icon}
    </Button>
  );
}

function normalizeLinkHref(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}
