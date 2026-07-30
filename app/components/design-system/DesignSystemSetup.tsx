import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  useActionQuery,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { openAgentSidebar } from "@agent-native/core/client/navigation";
import {
  IconWorld,
  IconPalette,
  IconLoader2,
  IconFolder,
  IconX,
  IconFileDescription,
  IconPhoto,
  IconCheck,
} from "@tabler/icons-react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

interface DesignSystemSetupProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  editingId?: string;
}

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  textContent?: string;
}

function normalizeWebsiteUrlInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : /^[a-z\d-]+$/i.test(trimmed)
      ? `https://${trimmed}.com`
      : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!parsed.hostname || /\s/.test(parsed.hostname)) return null;
    const normalized = parsed.toString();
    return normalized.endsWith("/") && !parsed.pathname.slice(1)
      ? normalized.slice(0, -1)
      : normalized;
  } catch {
    return null;
  }
}

function isDesignMdFile(file: UploadedFile) {
  const name = file.name.split(/[\\/]/).pop()?.toLowerCase() ?? file.name;
  return name === "design.md" || name === "design.mdx";
}

export function DesignSystemSetup({
  open,
  onClose,
  onComplete,
  editingId,
}: DesignSystemSetupProps) {
  const t = useT();
  const [companyName, setCompanyName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteUrls, setWebsiteUrls] = useState<string[]>([]);
  const [codeFiles, setCodeFiles] = useState<UploadedFile[]>([]);
  const [docFiles, setDocFiles] = useState<UploadedFile[]>([]);
  const [imageFiles, setImageFiles] = useState<UploadedFile[]>([]);
  const [brandNotes, setBrandNotes] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [generating, setGenerating] = useState(false);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const updateSystemMutation = useActionMutation("update-design-system");

  const { data: existingDs } = useActionQuery<{
    title?: string;
    description?: string;
    data?: string | null;
    customInstructions?: string;
  }>("get-design-system", editingId ? { id: editingId } : undefined, {
    enabled: !!editingId && open,
  });

  const { data: designSystemsData } = useActionQuery<{
    designSystems: Array<{ id: string; title: string }>;
  }>("list-design-systems");

  const existingSystems = designSystemsData?.designSystems ?? [];
  const [selectedSystemId, setSelectedSystemId] = useState("");

  useEffect(() => {
    if (existingDs && editingId) {
      setCompanyName(existingDs.title ?? "");
      setBrandNotes(existingDs.description ?? "");
      setCustomInstructions(existingDs.customInstructions ?? "");
      try {
        const parsed = existingDs.data ? JSON.parse(existingDs.data) : null;
        if (parsed?.notes) setBrandNotes(parsed.notes);
      } catch {
        // ignore
      }
    }
  }, [existingDs, editingId]);

  useEffect(() => {
    if (!open) {
      setCompanyName("");
      setWebsiteUrl("");
      setWebsiteUrls([]);
      setCodeFiles([]);
      setDocFiles([]);
      setImageFiles([]);
      setBrandNotes("");
      setCustomInstructions("");
      setSelectedSystemId("");
    }
  }, [open]);

  const hasAnySources = useMemo(() => {
    return (
      companyName.trim() ||
      websiteUrls.length > 0 ||
      codeFiles.length > 0 ||
      docFiles.length > 0 ||
      imageFiles.length > 0 ||
      selectedSystemId ||
      brandNotes.trim() ||
      customInstructions.trim()
    );
  }, [
    companyName,
    websiteUrls,
    codeFiles,
    docFiles,
    imageFiles,
    selectedSystemId,
    brandNotes,
    customInstructions,
  ]);

  const addWebsiteUrl = useCallback(() => {
    const url = normalizeWebsiteUrlInput(websiteUrl);
    if (!url) return;
    setWebsiteUrls((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setWebsiteUrl("");
  }, [websiteUrl]);

  const readTextFiles = useCallback(
    (
      fileList: FileList,
      setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    ) => {
      const newFiles: UploadedFile[] = [];
      const promises: Promise<void>[] = [];
      Array.from(fileList).forEach((f) => {
        const file: UploadedFile = {
          id: crypto.randomUUID(),
          name: f.name,
          type: f.type,
          size: f.size,
        };
        if (
          f.size < 200 * 1024 &&
          (f.name.match(
            /\.(css|scss|sass|less|ts|tsx|js|jsx|json|html|svg|xml|md|markdown|mdx|txt)$/i,
          ) ||
            f.type.startsWith("text/"))
        ) {
          promises.push(
            f.text().then((text) => {
              file.textContent = text;
            }),
          );
        }
        newFiles.push(file);
      });
      Promise.all(promises).then(() => {
        setter((prev) => [...prev, ...newFiles]);
      });
    },
    [],
  );

  const handleEditSave = async () => {
    if (!editingId) return;
    setGenerating(true);
    try {
      await updateSystemMutation.mutateAsync({
        id: editingId,
        title: companyName || "My Brand",
        description: brandNotes || undefined,
        customInstructions,
      });
      onComplete();
      toast.success(t("designSystemSetup.updated"));
    } catch {
      toast.error(t("designSystemSetup.updateFailed"));
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = useCallback(() => {
    if (editingId) {
      handleEditSave();
      return;
    }

    // Cap inlined file content so a giant pasted README doesn't blow the
    // prompt budget. Append a marker so the agent doesn't treat the
    // truncation point as the end of the document.
    const TEXT_INLINE_MAX = 5000;
    const inlineText = (text: string) =>
      text.length > TEXT_INLINE_MAX
        ? `${text.slice(0, TEXT_INLINE_MAX)}\n…[truncated, ${text.length - TEXT_INLINE_MAX} more chars]`
        : text;

    const parts: string[] = [];
    parts.push(
      "Set up a design system from the following sources. Analyze each source, extract design tokens (colors, fonts, spacing, borders), and create a cohesive design system for my projects with `create-design-system`.",
    );

    if (companyName.trim()) {
      parts.push(`\n## Company / Brand\n${companyName.trim()}`);
    }

    if (websiteUrls.length > 0) {
      parts.push(
        `\n## Website URLs\nAnalyze these websites for design tokens. Call \`import-from-url\` for each:\n${websiteUrls.map((u) => `- ${u}`).join("\n")}`,
      );
    }

    const designMdFiles = [...codeFiles, ...docFiles].filter(
      (file) => file.textContent && isDesignMdFile(file),
    );

    if (codeFiles.length > 0) {
      const withContent = codeFiles.filter(
        (f) => f.textContent && !isDesignMdFile(f),
      );
      if (withContent.length > 0) {
        parts.push(
          `\n## Code Files (${withContent.length} files)\nExtract design tokens (colors, typography, spacing, radii) from the code below and fold them into the design system:`,
        );
        for (const f of withContent) {
          parts.push(
            `\n### ${f.name}\n\`\`\`\n${inlineText(f.textContent!)}\n\`\`\``,
          );
        }
      }
    }

    if (designMdFiles.length > 0) {
      parts.push(
        `\n## design.md (${designMdFiles.length} file${designMdFiles.length === 1 ? "" : "s"})\nTreat this as the authoritative brand guidance. Apply its tokens and rules directly when creating the design system:`,
      );
      for (const f of designMdFiles) {
        parts.push(
          `\n### ${f.name}\n\`\`\`md\n${inlineText(f.textContent!)}\n\`\`\``,
        );
      }
    }

    if (docFiles.length > 0) {
      const inlined = docFiles.filter(
        (f) => f.textContent && !isDesignMdFile(f),
      );
      const binary = docFiles.filter((f) => !f.textContent);
      if (inlined.length > 0) {
        parts.push(
          `\n## Documents (${inlined.length} text files — content inlined)\nExtract brand cues from the content below.`,
        );
        for (const f of inlined) {
          parts.push(
            `\n### ${f.name}\n\`\`\`\n${inlineText(f.textContent!)}\n\`\`\``,
          );
        }
      }
      if (binary.length > 0) {
        parts.push(
          `\n## Documents\nExtract brand cues. Call \`import-document\` with metadata:\n${binary.map((f) => `- ${f.name} (${f.type}, ${formatSize(f.size)})`).join("\n")}`,
        );
      }
    }

    if (imageFiles.length > 0) {
      parts.push(
        `\n## Visual References\n${imageFiles.map((f) => `- ${f.name}`).join("\n")}`,
      );
    }

    if (selectedSystemId) {
      const system = existingSystems.find((s) => s.id === selectedSystemId);
      if (system) {
        parts.push(
          `\n## Fork Existing Design System\nClone "${system.title}" as a starting point. Call \`import-design-project --designSystemId ${selectedSystemId}\``,
        );
      }
    }

    if (brandNotes.trim()) {
      parts.push(`\n## Additional Notes\n${brandNotes.trim()}`);
    }

    if (customInstructions.trim()) {
      parts.push(
        `\n## Custom Instructions (durable — store on the design system)\nPass these verbatim as the \`customInstructions\` argument to \`create-design-system\`. They will be re-applied every time the design system is used to generate slides:\n\n${customInstructions.trim()}`,
      );
    }

    parts.push(
      `\n---\nAfter processing all sources, call \`create-design-system\` with the combined tokens${
        customInstructions.trim()
          ? " AND the verbatim --customInstructions string from above"
          : ""
      }. Present a summary for review.`,
    );

    openAgentSidebar();
    sendToAgentChat({ message: parts.join("\n"), submit: true });
    toast(t("designSystemSetup.generationStarted"), {
      description: t("designSystemSetup.generationStartedDescription"),
    });
    onComplete();
  }, [
    editingId,
    companyName,
    websiteUrls,
    codeFiles,
    docFiles,
    imageFiles,
    selectedSystemId,
    existingSystems,
    brandNotes,
    customInstructions,
    onComplete,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] p-0 bg-card border-border">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <IconPalette className="w-5 h-5 text-[#609FF8]" />
            {editingId
              ? t("designSystemSetup.editTitle")
              : t("designSystemSetup.newTitle")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {editingId
              ? t("designSystemSetup.editDescription")
              : t("designSystemSetup.newDescription")}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-160px)] px-6">
          <div className="space-y-5 py-4">
            {/* Company Name */}
            <div className="space-y-2">
              <Label className="text-foreground/80">
                {t("designSystemSetup.companyBrand")}
              </Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("designSystemSetup.companyBrandPlaceholder")}
                className="bg-accent border-border text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {!editingId && (
              <>
                {/* Website URL */}
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-1.5">
                    <IconWorld className="w-3.5 h-3.5" />
                    {t("designSystemSetup.websiteUrl")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder={t("designSystemSetup.websitePlaceholder")}
                      className="bg-accent border-border text-foreground placeholder:text-muted-foreground"
                      onBlur={() => {
                        const normalized = normalizeWebsiteUrlInput(websiteUrl);
                        if (normalized) setWebsiteUrl(normalized);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addWebsiteUrl();
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addWebsiteUrl}
                      className="shrink-0 cursor-pointer"
                    >
                      {t("designSystemSetup.add")}
                    </Button>
                  </div>
                  <TagList
                    items={websiteUrls}
                    onRemove={(i) =>
                      setWebsiteUrls((p) => p.filter((_, j) => j !== i))
                    }
                  />
                </div>

                {/* Code Files */}
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-1.5">
                    <IconFolder className="w-3.5 h-3.5" />
                    {t("designSystemSetup.codeFiles")}
                  </Label>
                  <button
                    onClick={() => codeInputRef.current?.click()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files)
                        readTextFiles(e.dataTransfer.files, setCodeFiles);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    className="w-full border border-dashed border-border rounded-lg p-4 text-center hover:border-foreground/20 cursor-pointer"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t("designSystemSetup.codeFilesDrop")}
                    </p>
                  </button>
                  <input
                    ref={codeInputRef}
                    type="file"
                    multiple
                    accept=".css,.scss,.sass,.less,.ts,.tsx,.js,.jsx,.json,.html,.svg,.xml,.md,.markdown,.mdx,.txt"
                    onChange={(e) => {
                      if (e.target.files)
                        readTextFiles(e.target.files, setCodeFiles);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <FileList
                    files={codeFiles}
                    onRemove={(id) =>
                      setCodeFiles((p) => p.filter((f) => f.id !== id))
                    }
                  />
                </div>

                {/* Documents */}
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-1.5">
                    <IconFileDescription className="w-3.5 h-3.5" />
                    {t("designSystemSetup.documents")}
                  </Label>
                  <button
                    onClick={() => docInputRef.current?.click()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files)
                        readTextFiles(e.dataTransfer.files, setDocFiles);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    className="w-full border border-dashed border-border rounded-lg p-4 text-center hover:border-foreground/20 cursor-pointer"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t("designSystemSetup.documentsDrop")}
                    </p>
                  </button>
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pptx,.ppt,.docx,.doc,.pdf,.xlsx,.xls,.md,.markdown,.mdx,.txt"
                    multiple
                    onChange={(e) => {
                      if (e.target.files)
                        readTextFiles(e.target.files, setDocFiles);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <FileList
                    files={docFiles}
                    onRemove={(id) =>
                      setDocFiles((p) => p.filter((f) => f.id !== id))
                    }
                  />
                </div>

                {/* Images */}
                <div className="space-y-2">
                  <Label className="text-foreground/80 flex items-center gap-1.5">
                    <IconPhoto className="w-3.5 h-3.5" />
                    {t("designSystemSetup.visualReferences")}
                  </Label>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full border border-dashed border-border rounded-lg p-4 text-center hover:border-foreground/20 cursor-pointer"
                  >
                    <p className="text-xs text-muted-foreground">
                      {t("designSystemSetup.visualReferencesDrop")}
                    </p>
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,.svg"
                    multiple
                    onChange={(e) => {
                      if (!e.target.files) return;
                      const newFiles = Array.from(e.target.files).map((f) => ({
                        id: crypto.randomUUID(),
                        name: f.name,
                        type: f.type,
                        size: f.size,
                      }));
                      setImageFiles((p) => [...p, ...newFiles]);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                  <FileList
                    files={imageFiles}
                    onRemove={(id) =>
                      setImageFiles((p) => p.filter((f) => f.id !== id))
                    }
                  />
                </div>

                {/* Fork existing */}
                {existingSystems.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-foreground/80">
                      {t("designSystemSetup.forkExisting")}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      {existingSystems
                        .filter((s) => s.id !== editingId)
                        .map((ds) => (
                          <button
                            key={ds.id}
                            onClick={() =>
                              setSelectedSystemId((prev) =>
                                prev === ds.id ? "" : ds.id,
                              )
                            }
                            className={`text-left p-3 rounded-lg border cursor-pointer ${
                              selectedSystemId === ds.id
                                ? "border-[#609FF8]/40 bg-[#609FF8]/5"
                                : "border-border bg-accent hover:border-foreground/20"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <IconPalette className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm text-foreground/80 truncate">
                                {ds.title}
                              </span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Brand Notes */}
            <div className="space-y-2">
              <Label className="text-foreground/80">
                {editingId
                  ? t("designSystemSetup.brandNotes")
                  : t("designSystemSetup.additionalNotes")}
              </Label>
              <Textarea
                value={brandNotes}
                onChange={(e) => setBrandNotes(e.target.value)}
                placeholder={t("designSystemSetup.notesPlaceholder")}
                rows={3}
                className="bg-accent border-border text-foreground placeholder:text-muted-foreground resize-none"
              />
            </div>

            {/* Custom Instructions — durable, stored on the design system */}
            <div className="space-y-2">
              <Label className="text-foreground/80">
                {t("designSystemSetup.customInstructions")}
              </Label>
              <Textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder={t(
                  "designSystemSetup.customInstructionsPlaceholder",
                )}
                rows={4}
                className="bg-accent border-border text-foreground placeholder:text-muted-foreground resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                {t("designSystemSetup.customInstructionsDescription")}
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 pb-6 pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={generating}
            className="text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t("designSystemSetup.cancel")}
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={editingId ? generating : !hasAnySources}
            className="cursor-pointer"
          >
            {generating ? (
              <>
                <IconLoader2 className="w-4 h-4 animate-spin" />
                {t("designSystemSetup.saving")}
              </>
            ) : editingId ? (
              t("designSystemSetup.saveChanges")
            ) : (
              t("designSystemSetup.continueToGeneration")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TagList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (index: number) => void;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-sm text-foreground/80 bg-accent rounded-md px-3 py-1.5"
        >
          <IconCheck className="w-3.5 h-3.5 text-green-500/70 shrink-0" />
          <span className="truncate flex-1">{item}</span>
          <button
            onClick={() => onRemove(i)}
            aria-label={t("designSystemSetup.removeItem", { item })}
            className="text-muted-foreground hover:text-foreground/70 shrink-0 cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function FileList({
  files,
  onRemove,
}: {
  files: UploadedFile[];
  onRemove: (id: string) => void;
}) {
  const t = useT();
  if (files.length === 0) return null;
  return (
    <div className="space-y-1">
      {files.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 text-sm text-foreground/80 bg-accent rounded-md px-3 py-1.5"
        >
          <IconCheck className="w-3.5 h-3.5 text-green-500/70 shrink-0" />
          <span className="truncate flex-1">{f.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatSize(f.size)}
          </span>
          <button
            onClick={() => onRemove(f.id)}
            aria-label={t("designSystemSetup.removeItem", { item: f.name })}
            className="text-muted-foreground hover:text-foreground/70 shrink-0 cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
