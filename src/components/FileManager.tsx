import React, { useEffect, useState, useRef } from "react"; 
import { LoadingOverlay } from "../components/LoadingOverlay";
import axios from "axios";
import { Folder, File, ArrowLeft, Upload, Trash2, Edit2, Save, Archive, Search, X, CheckSquare, Square, Download , FilePlus, FolderPlus, MoreVertical, FileArchive} from "lucide-react";
import { useUpload } from "../context/UploadContext";
import { motion, AnimatePresence } from "framer-motion";
import CodeEditor from "./CodeEditor";
import { useNotification } from "../context/NotificationContext";

const LANGUAGE_OPTIONS = [
  { value: "plaintext", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "php", label: "PHP" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "properties", label: "Properties / INI" },
  { value: "shell", label: "Shell Script" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "markdown", label: "Markdown" },
];

const EXT_TO_LANGUAGE: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", pyw: "python",
  java: "java",
  php: "php",
  json: "json", jsonc: "json",
  yml: "yaml", yaml: "yaml",
  properties: "properties", ini: "properties", cfg: "properties", conf: "properties", env: "properties", toml: "properties",
  sh: "shell", bash: "shell",
  sql: "sql",
  html: "html", htm: "html", xml: "html",
  css: "css", scss: "css",
  md: "markdown", markdown: "markdown",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return EXT_TO_LANGUAGE[ext] || "plaintext";
}

// Everything the built-in editor will actually open as text. Anything not
// in this list (and not an image) falls back to download-only, since
// trying to render arbitrary binary data as text would just show garbage.
const TEXT_EXTENSIONS = /\.(txt|json|jsonc|yml|yaml|properties|log|ini|cfg|conf|env|toml|js|mjs|cjs|jsx|ts|tsx|py|pyw|java|php|sh|bash|sql|html|htm|xml|css|scss|md|markdown|gitignore|dockerfile|lua|rb|go|rs|c|cpp|h|hpp|cs)$/i;
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i;

function bytesToHexDump(base64: string): { offset: string; hex: string; ascii: string }[] {
  if (!base64) return [];
  const binary = atob(base64);
  const rows: { offset: string; hex: string; ascii: string }[] = [];
  for (let i = 0; i < binary.length; i += 16) {
    const chunk = binary.slice(i, i + 16);
    const hexParts: string[] = [];
    let ascii = "";
    for (let j = 0; j < chunk.length; j++) {
      const code = chunk.charCodeAt(j);
      hexParts.push(code.toString(16).padStart(2, "0"));
      ascii += code >= 32 && code <= 126 ? chunk[j] : ".";
    }
    // Pad the hex column so ascii stays aligned on short trailing rows
    while (hexParts.length < 16) hexParts.push("  ");
    const hexStr = hexParts.slice(0, 8).join(" ") + "  " + hexParts.slice(8).join(" ");
    rows.push({ offset: i.toString(16).padStart(8, "0"), hex: hexStr, ascii });
  }
  return rows;
}

function HexViewer({ base64 }: { base64: string }) {
  const rows = React.useMemo(() => bytesToHexDump(base64), [base64]);
  return (
    <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-border bg-black/60 font-mono text-xs custom-scrollbar">
      <div className="p-3">
        {rows.map((row) => (
          <div key={row.offset} className="flex gap-4 text-gray-400 whitespace-pre hover:bg-white/5 px-1 rounded">
            <span className="text-theme-400/70 select-none">{row.offset}</span>
            <span className="text-gray-300">{row.hex}</span>
            <span className="text-gray-500">{row.ascii}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FileManager({ serverId }: { serverId: string }) {
  const { notify } = useNotification();
  const [files, setFiles] = useState<any[]>([]);
  const [path, setPath] = useState("/");
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editorLanguage, setEditorLanguage] = useState("plaintext");
  const [isTruncated, setIsTruncated] = useState(false);
  const [hexView, setHexView] = useState<{ name: string; base64: string; truncated: boolean; size: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ name: string; src: string } | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const { startUpload, uploads } = useUpload();
  const processedUploadIds = useRef<Set<string>>(new Set());
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [isUnzipping, setIsUnzipping] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  
  const handleCreateFile = async () => {
    const fileName = prompt("Enter new file name (e.g. config.yml):");
    if (!fileName) return;
    try {
      const fullPath = path.endsWith("/") ? path + fileName : path + "/" + fileName;
      await axios.post(`/api/servers/${serverId}/files/create`, { filePath: fullPath });
      fetchFiles();
      openFile(fileName);
    } catch (e) {
      notify("Failed to create file");
    }
  };

  const handleCreateFolder = async () => {
    const folderName = prompt("Enter new folder name:");
    if (!folderName) return;
    try {
      const fullPath = path.endsWith("/") ? path + folderName : path + "/" + folderName;
      await axios.post(`/api/servers/${serverId}/files/mkdir`, { filePath: fullPath });
      fetchFiles();
    } catch (e) {
      notify("Failed to create folder");
    }
  };

  const fetchFiles = async () => {
    try {
      const res = await axios.get(`/api/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
      if (res.data.isFile) {
         setFileContent(res.data.content);
      } else {
         setFiles(res.data);
      }
    } catch (e) {
      setFiles([]);
    }
  };

  useEffect(() => {
    fetchFiles();
    setSelectedFiles(new Set());
    setSearchQuery("");
  }, [path, serverId]);

  const goUp = () => {
    if (editingFile) {
      setEditingFile(null);
      return;
    }
    if (hexView) {
      setHexView(null);
      return;
    }
    if (path === "/") return;
    const parts = path.split("/").filter(Boolean);
    parts.pop();
    setPath("/" + parts.join("/"));
  };

  const traverse = (dirName: string) => {
    setPath(path.endsWith("/") ? path + dirName : path + "/" + dirName);
  };

  const openFile = async (name: string) => {
    const fullPath = path.endsWith("/") ? path + name : path + "/" + name;
    try {
      const res = await axios.get(`/api/servers/${serverId}/files?path=${encodeURIComponent(fullPath)}`);
      if (!res.data.isFile) return;
      if (res.data.isImage) {
        setPreviewImage({ name, src: `data:${res.data.mimeType};base64,${res.data.content}` });
        return;
      }
      if (res.data.isBinary) {
        if (res.data.tooLarge) {
          notify("This file is too large to preview in the panel — use Download from the ⋮ menu instead.");
          return;
        }
        // Not text, but we can still open it — show a read-only hex view
        // instead of just refusing.
        setHexView({
          name,
          base64: res.data.hexPreview || "",
          truncated: !!res.data.hexTruncated,
          size: res.data.size || 0,
        });
        return;
      }
      setEditingFile(name);
      setFileContent(res.data.content);
      setEditorLanguage(detectLanguage(name));
      setIsTruncated(!!res.data.truncated);
    } catch (e) {
      notify("Failed to load file");
    }
  };

  const saveFile = async () => {
    setIsSaving(true);
    try {
      const fullPath = path.endsWith("/") ? path + editingFile : path + "/" + editingFile;
      await axios.post(`/api/servers/${serverId}/files/save`, {
        filePath: fullPath,
        content: fileContent
      });
      console.log("File saved!");
    } catch(e) {
      console.error("Failed to save file.", e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSelectedFiles = async () => {
    if (selectedFiles.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedFiles.size} items?`)) return;
    
    try {
      const p = path.endsWith("/") ? path : path + "/";
      const pathsToDelete = Array.from(selectedFiles).map(name => p + name);
      
      setDeletingFile("multiple");
      await axios.delete(`/api/servers/${serverId}/files`, {
        data: { paths: pathsToDelete }
      });
      setSelectedFiles(new Set());
      fetchFiles();
    } catch(e) {
      console.error("Failed to delete files", e);
      notify("Failed to delete files");
    } finally {
      setDeletingFile(null);
    }
  };

  const handleRenameSelected = () => {
    if (selectedFiles.size !== 1) return;
    const name = Array.from(selectedFiles)[0];
    setRenamingFile(name);
    setNewName(name);
  };

  const handleDownloadFile = async (name: string) => {
    try {
      const p = path.endsWith("/") ? path : path + "/";
      const res = await axios.get(`/api/servers/${serverId}/files/download`, {
        params: { path: p + name },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to download file", e);
      notify("Failed to download file.");
    } finally {
      setMenuOpenFor(null);
    }
  };

  const handleUnzipFile = async (name: string) => {
    setIsUnzipping(true);
    try {
      const p = path.endsWith("/") ? path : path + "/";
      await axios.post(`/api/servers/${serverId}/files/unzip`, { path: p + name });
      fetchFiles();
    } catch (e) {
      console.error("Failed to unzip", e);
      notify("Failed to extract archive.");
    } finally {
      setIsUnzipping(false);
      setMenuOpenFor(null);
    }
  };

  const handleDeleteFile = async (name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      const p = path.endsWith("/") ? path : path + "/";
      setDeletingFile(name);
      await axios.delete(`/api/servers/${serverId}/files`, { data: { paths: [p + name] } });
      fetchFiles();
    } catch (e) {
      console.error("Failed to delete file", e);
      notify("Failed to delete file.");
    } finally {
      setDeletingFile(null);
      setMenuOpenFor(null);
    }
  };

  const handleRename = async (oldName: string) => {
    if(!newName.trim() || newName === oldName) {
      setRenamingFile(null);
      return;
    }
    try {
      const p = path.endsWith("/") ? path : path + "/";
      await axios.post(`/api/servers/${serverId}/files/rename`, {
        oldPath: p + oldName,
        newPath: p + newName
      });
      setRenamingFile(null);
      fetchFiles();
    } catch(e) {
      console.error("Failed to rename", e);
    }
  };

  const handleUnzipSelected = async () => {
    if (selectedFiles.size !== 1) return;
    const name = Array.from(selectedFiles)[0];
    setIsUnzipping(true);
    try {
      const p = path.endsWith("/") ? path : path + "/";
      await axios.post(`/api/servers/${serverId}/files/unzip`, {
        path: p + name
      });
      setSelectedFiles(new Set());
      fetchFiles();
      console.log("Unzipped successfully");
    } catch(e) {
      console.error("Failed to unzip", e);
    } finally {
      setIsUnzipping(false);
    }
  };

  const handleZipSelected = async () => {
    if (selectedFiles.size === 0) return;
    const outputName = prompt("Enter archive name:", "archive.zip");
    if (!outputName) return;

    setIsZipping(true);
    try {
      const p = path.endsWith("/") ? path : path + "/";
      await axios.post(`/api/servers/${serverId}/files/zip`, {
        dirPath: p,
        fileNames: Array.from(selectedFiles),
        outputName: outputName.endsWith(".zip") ? outputName : outputName + ".zip"
      });
      setSelectedFiles(new Set());
      fetchFiles();
    } catch (e) {
      console.error("Failed to zip files", e);
    } finally {
      setIsZipping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = ""; // clear input right away so selecting the same file again re-triggers

    const CHUNK_THRESHOLD = 25 * 1024 * 1024; // 25MB — bigger files go through the background chunked uploader

    if (file.size > CHUNK_THRESHOLD) {
      // Background chunked upload (merged from Jtg panel) — shows progress in the
      // floating upload tray so the user can keep working elsewhere while it uploads.
      startUpload(file, serverId, path);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("path", path);

    try {
      setUploadProgress(0);
      await axios.post(`/api/servers/${serverId}/files/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        }
      });
      fetchFiles();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploadProgress(null);
    }
  };

  // Refresh the file list once a background chunked upload targeting this
  // server + folder finishes, without re-triggering on every render.
  useEffect(() => {
    uploads.forEach((u) => {
      if (u.serverId === serverId && u.path === path && u.status === "completed" && !processedUploadIds.current.has(u.id)) {
        processedUploadIds.current.add(u.id);
        fetchFiles();
      }
    });
  }, [uploads, serverId, path]);

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.name)));
    }
  };

  const toggleSelectFile = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedFiles);
    if (newSet.has(name)) {
      newSet.delete(name);
    } else {
      newSet.add(name);
    }
    setSelectedFiles(newSet);
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative min-h-0 h-full w-full bg-transparent p-4 md:p-6">
      <div className="p-4 md:p-6 mb-6 flex flex-col sm:flex-row items-center justify-between bg-black/40 dark:bg-black/40 backdrop-blur-xl rounded-3xl border border-border shrink-0 gap-4 shadow-[0_0_40px_-15px_rgba(0,0,0,0.5)] ring-1 ring-border-subtle">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center space-x-3">
            <button onClick={goUp} disabled={path === "/" && !editingFile && !hexView} className="p-2 bg-gray-800/60 hover:bg-gray-700/60 rounded-lg text-gray-300 disabled:opacity-50 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="font-mono text-sm font-bold text-foreground bg-black/60 px-4 py-2 rounded-xl border border-border backdrop-blur-md shadow-inner max-w-[150px] sm:max-w-xs truncate tracking-tight">
              {editingFile ? `Editing: ${editingFile}` : hexView ? `Viewing: ${hexView.name}` : (path === "/" ? "/home/container" : `/home/container${path}`)}
            </div>
          </div>
          
          <div className="flex sm:hidden items-center space-x-2">
            {!editingFile && !hexView ? (
              <div className="relative flex space-x-1">
                {uploadProgress !== null ? (
                  <div className="flex items-center justify-center w-8 h-8 bg-theme-600/50 rounded-lg border border-theme-500/50 text-foreground">
                    <div className="w-4 h-4 rounded-full border-2 border-theme-200 border-t-transparent animate-spin"></div>
                  </div>
                ) : (
                  <>
                    <button onClick={handleCreateFile} className="flex items-center justify-center w-8 h-8 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-lg text-foreground transition-colors cursor-pointer border border-border-subtle">
                      <FilePlus size={16} />
                    </button>
                    <button onClick={handleCreateFolder} className="flex items-center justify-center w-8 h-8 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-lg text-foreground transition-colors cursor-pointer border border-border-subtle">
                      <FolderPlus size={16} />
                    </button>
                    <label className="flex items-center justify-center w-8 h-8 bg-theme-600/90 hover:bg-theme-500/90 rounded-lg text-foreground transition-colors cursor-pointer">
                      <input 
                        type="file" 
                        onChange={handleFileUpload} 
                        className="hidden"
                      />
                      <Upload size={16} />
                    </label>
                  </>
                )}
              </div>
            ) : editingFile ? (
              <button disabled={isSaving || isTruncated} title={isTruncated ? "Can't save — only the end of this large file was loaded" : undefined} onClick={saveFile} className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-500 rounded-lg text-foreground transition-colors disabled:opacity-50">
                {isSaving ? <div className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin"></div> : <Save size={16} />}
              </button>
            ) : (
              <button onClick={() => hexView && handleDownloadFile(hexView.name)} className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-500 rounded-lg text-foreground transition-colors">
                <Download size={16} />
              </button>
            )}
          </div>
        </div>
        
        {!editingFile && !hexView && (
          <div className="flex-1 w-full px-0 sm:px-4 order-last sm:order-none">
            <div className="relative w-full max-w-2xl mx-auto shadow-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search files..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-full py-2.5 pl-10 pr-4 text-sm text-gray-200 focus:outline-none focus:border-theme-500 focus:ring-1 focus:ring-theme-500 transition-all shadow-inner"
              />
            </div>
          </div>
        )}

        {!editingFile && !hexView ? (
          <div className="relative hidden sm:block">
            {uploadProgress !== null ? (
              <div className="flex items-center space-x-2 px-4 py-2 bg-theme-600/50 rounded-lg text-sm font-medium border border-theme-500/50 text-foreground">
                <div className="w-4 h-4 rounded-full border-2 border-theme-200 border-t-transparent animate-spin mr-1"></div>
                <span>{uploadProgress === 100 ? "Processing..." : `${uploadProgress}%`}</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button onClick={handleCreateFile} className="flex items-center space-x-2 px-4 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-full text-sm font-medium text-foreground transition-colors backdrop-blur-sm border border-border-subtle cursor-pointer">
                  <FilePlus size={16} /> <span className="hidden md:inline">New File</span>
                </button>
                <button onClick={handleCreateFolder} className="flex items-center space-x-2 px-4 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-full text-sm font-medium text-foreground transition-colors backdrop-blur-sm border border-border-subtle cursor-pointer">
                  <FolderPlus size={16} /> <span className="hidden md:inline">New Folder</span>
                </button>
                <label className="flex items-center space-x-2 px-4 py-2.5 bg-theme-600/90 hover:bg-theme-500/90 rounded-full text-sm font-medium text-foreground transition-colors backdrop-blur-sm shadow-lg shadow-theme-500/20 cursor-pointer">
                  <input 
                    type="file" 
                    onChange={handleFileUpload} 
                    className="hidden"
                  />
                  <Upload size={16} /> <span>Upload</span>
                </label>
              </div>
            )}
          </div>
        ) : editingFile ? (
          <button disabled={isSaving || isTruncated} title={isTruncated ? "Can't save — only the end of this large file was loaded" : undefined} onClick={saveFile} className="hidden sm:flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-full text-sm font-medium text-foreground transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50">
            {isSaving ? <div className="w-4 h-4 rounded-full border-2 border-white/50 border-t-white animate-spin"></div> : <Save size={16} />}
            <span>{isSaving ? "Saving..." : "Save"}</span>
          </button>
        ) : (
          <button onClick={() => hexView && handleDownloadFile(hexView.name)} className="hidden sm:flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-full text-sm font-medium text-foreground transition-colors shadow-lg shadow-blue-500/20">
            <Download size={16} />
            <span>Download</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col min-h-0 relative">
        <AnimatePresence mode="wait">
          {hexView ? (
            <motion.div
              key="hexview"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="mb-2 shrink-0 px-3 py-2 rounded-lg bg-theme-500/10 border border-theme-500/30 text-theme-300 text-xs">
                This isn't a text file, so it's shown as a read-only hex dump
                {hexView.truncated ? ` — first ${(256).toLocaleString()}KB of ${(hexView.size / (1024 * 1024)).toFixed(1)}MB shown` : ""}.
                Use Download for the full file.
              </div>
              <HexViewer base64={hexView.base64} />
            </motion.div>
          ) : editingFile ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="flex items-center justify-between mb-2 shrink-0">
                <span className="text-xs text-gray-400">Syntax</span>
                <select
                  value={editorLanguage}
                  onChange={(e) => setEditorLanguage(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {isTruncated && (
                <div className="mb-2 shrink-0 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                  This file is large — showing only the last part. Editing is view-only here; use Download from the ⋮ menu for the full file.
                </div>
              )}
              <div className="flex-1 min-h-0">
                <CodeEditor value={fileContent} onChange={setFileContent} language={editorLanguage} />
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="filelist"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1"
            >
              {/* Header row with select all */}
              {filteredFiles.length > 0 && (
                <div className="flex items-center px-3 py-2 mb-2 border-b border-gray-700/50">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-foreground mr-4 transition-colors">
                    {selectedFiles.size === filteredFiles.length ? <CheckSquare size={18} className="text-theme-400" /> : <Square size={18} />}
                  </button>
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Name</span>
                </div>
              )}

              {filteredFiles.length === 0 && <p className="text-gray-400 text-sm text-center py-10">Directory is empty or no files match search.</p>}
              
              {filteredFiles.map(f => {
                const isSelected = selectedFiles.has(f.name);
                return (
                  <div 
                    key={f.name} 
                    onClick={(e) => toggleSelectFile(f.name, e)}
                    className={`flex items-center justify-between p-3 rounded-xl group transition-all cursor-pointer mb-1 border ${isSelected ? 'bg-theme-500/10 border-theme-500/30' : 'bg-gray-800/20 border-transparent hover:bg-gray-800/60 hover:border-gray-700/50'}`}
                  >
                    <div className="flex items-center space-x-4 flex-1 overflow-hidden">
                      <button onClick={(e) => toggleSelectFile(f.name, e)} className={`transition-colors shrink-0 ${isSelected ? 'text-theme-400' : 'text-gray-500 group-hover:text-gray-400'}`}>
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      <div className="flex items-center space-x-3 flex-1 overflow-hidden hover:opacity-80 transition-opacity" onClick={(e) => { e.stopPropagation(); f.isDirectory ? traverse(f.name) : openFile(f.name); }}>
                        {f.isDirectory ? <Folder className="text-blue-400 shrink-0" size={20} /> : <File className="text-gray-400 shrink-0" size={20} />}
                        {renamingFile === f.name ? (
                          <input 
                            autoFocus
                            type="text" 
                            value={newName} 
                            onClick={e => e.stopPropagation()}
                            onChange={e => setNewName(e.target.value)}
                            onBlur={() => handleRename(f.name)}
                            onKeyDown={e => e.key === 'Enter' && handleRename(f.name)}
                            className="bg-gray-900/80 border border-gray-600 rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-theme-500/50 w-full"
                          />
                        ) : (
                          <span className="font-medium text-gray-200 text-sm truncate">{f.name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 md:space-x-4 pl-4 shrink-0">
                      {!f.isDirectory && <span className="hidden sm:block text-xs text-gray-400 w-16 text-right">{(f.size/1024).toFixed(1)} KB</span>}
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === f.name ? null : f.name); }}
                          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg transition-colors"
                          title="More options"
                        >
                          <MoreVertical size={16} />
                        </button>
                        {menuOpenFor === f.name && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpenFor(null); }} />
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-1.5 z-20"
                            >
                              {!f.isDirectory && (
                                <button onClick={() => handleDownloadFile(f.name)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-700/60 hover:text-foreground transition-colors">
                                  <Download size={15} /> Download
                                </button>
                              )}
                              <button onClick={() => { setRenamingFile(f.name); setNewName(f.name); setMenuOpenFor(null); }} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-700/60 hover:text-foreground transition-colors">
                                <Edit2 size={15} /> Rename
                              </button>
                              {!f.isDirectory && (f.name.endsWith(".zip") || f.name.endsWith(".rar")) && (
                                <button onClick={() => handleUnzipFile(f.name)} disabled={isUnzipping} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-700/60 hover:text-foreground transition-colors disabled:opacity-50">
                                  <FileArchive size={15} /> Extract
                                </button>
                              )}
                              <div className="h-px bg-gray-700 my-1" />
                              <button onClick={() => handleDeleteFile(f.name)} disabled={deletingFile === f.name} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                                <Trash2 size={15} /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Menu for Selected Files */}
        <AnimatePresence>
          {selectedFiles.size > 0 && !editingFile && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: 50 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-800/90 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-2xl p-2 flex items-center space-x-2 z-10"
            >
              <span className="px-3 text-sm font-medium text-gray-300">
                {selectedFiles.size} selected
              </span>
              <div className="h-6 w-px bg-gray-700"></div>
              
              {selectedFiles.size === 1 && (
                <>
                  <button onClick={handleRenameSelected} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-700/50 rounded-lg transition-colors" title="Rename">
                    <Edit2 size={16} />
                  </button>
                  {(Array.from(selectedFiles)[0] as string).match(/\.(zip|rar)$/i) && (
                    <button onClick={handleUnzipSelected} disabled={isUnzipping} className="p-2 text-gray-400 hover:text-theme-400 hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50" title="Unzip">
                      {isUnzipping ? (
                        <div className="w-4 h-4 rounded-full border-2 border-theme-500/50 border-t-theme-500 animate-spin"></div>
                      ) : (
                        <Archive size={16} />
                      )}
                    </button>
                  )}
                </>
              )}
              
              <button onClick={handleZipSelected} disabled={isZipping} className="p-2 text-gray-400 hover:text-green-400 hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50" title="Zip Selected">
                {isZipping ? (
                  <div className="w-4 h-4 rounded-full border-2 border-green-500/50 border-t-green-500 animate-spin"></div>
                ) : (
                  <Download size={16} />
                )}
              </button>
              
              <button onClick={deleteSelectedFiles} disabled={deletingFile === "multiple"} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded-lg transition-colors disabled:opacity-50" title="Delete Selected">
                {deletingFile === "multiple" ? (
                  <div className="w-4 h-4 rounded-full border-2 border-red-500/50 border-t-red-500 animate-spin"></div>
                ) : (
                  <Trash2 size={16} />
                )}
              </button>

              <div className="h-6 w-px bg-gray-700"></div>
              <button onClick={() => setSelectedFiles(new Set())} className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded-lg transition-colors" title="Clear Selection">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
          {(isUnzipping || isZipping || isSaving) && <LoadingOverlay />}
          <AnimatePresence>
            {previewImage && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setPreviewImage(null)}
                className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6"
              >
                <div className="flex items-center gap-3 mb-4 text-gray-200 text-sm font-medium">
                  {previewImage.name}
                  <button onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <img
                  src={previewImage.src}
                  alt={previewImage.name}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-full max-h-[80vh] rounded-xl border border-gray-700/50 shadow-2xl object-contain"
                />
              </motion.div>
            )}
          </AnimatePresence>
    </div>
  );
}
