"use client";

import { FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface Attachment {
	id: string;
	filename: string;
	mimetype: string;
	url: string;
	size: number;
}

interface UploadingFile {
	file: File;
	progress: number;
	error?: string;
}

function getAuthHeaders(): Record<string, string> {
	const headers: Record<string, string> = {};
	if (typeof window !== "undefined") {
		const token = localStorage.getItem("token");
		if (token && /^[\x20-\x7E]+$/.test(token)) {
			headers.Authorization = `Bearer ${token}`;
		}
	}
	return headers;
}

async function uploadAttachment(
	assignmentId: string,
	file: File,
	onProgress?: (progress: number) => void,
): Promise<Attachment> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", `${API_URL}/students/me/assignments/${encodeURIComponent(assignmentId)}/attachments`);

		const authHeaders = getAuthHeaders();
		for (const [key, value] of Object.entries(authHeaders)) {
			xhr.setRequestHeader(key, value);
		}

		xhr.upload.addEventListener("progress", (e) => {
			if (e.lengthComputable) {
				onProgress?.(Math.round((e.loaded / e.total) * 100));
			}
		});

		xhr.addEventListener("load", () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const response = JSON.parse(xhr.responseText);
					resolve(response.data);
				} catch {
					reject(new Error("Phản hồi không hợp lệ"));
				}
			} else {
				try {
					const error = JSON.parse(xhr.responseText);
					reject(new Error(error.message || "Tải lên thất bại"));
				} catch {
					reject(new Error("Tải lên thất bại"));
				}
			}
		});

		xhr.addEventListener("error", () => reject(new Error("Lỗi mạng")));
		xhr.addEventListener("abort", () => reject(new Error("Đã hủy")));

		const formData = new FormData();
		formData.append("file", file);
		xhr.send(formData);
	});
}

async function deleteAttachment(assignmentId: string, attachmentId: string): Promise<void> {
	const response = await fetch(
		`${API_URL}/students/me/assignments/${encodeURIComponent(assignmentId)}/attachments/${encodeURIComponent(attachmentId)}`,
		{
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
				...getAuthHeaders(),
			},
		},
	);
	if (!response.ok) {
		const error = await response.json().catch(() => ({ message: "Không thể xóa tệp" }));
		throw new Error(error.message || "Không thể xóa tệp");
	}
}

function isImageType(mimetype: string): boolean {
	return mimetype.startsWith("image/");
}

function AttachmentPreview({
	attachment,
	onDelete,
	deleting,
}: {
	attachment: Attachment;
	onDelete: () => void;
	deleting: boolean;
}) {
	return (
		<div className="group relative flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
			{isImageType(attachment.mimetype) ? (
				// User-uploaded attachment served from object storage; next/image is not applicable.
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={attachment.url}
					alt={attachment.filename}
					className="h-12 w-12 rounded-lg object-cover"
				/>
			) : (
				<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
					<FileText className="h-6 w-6 text-red-500" />
				</div>
			)}
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium text-gray-900">
					{attachment.filename}
				</p>
				<p className="text-xs text-gray-500">
					{(attachment.size / 1024).toFixed(1)} KB
				</p>
			</div>
			<button
				type="button"
				onClick={onDelete}
				disabled={deleting}
				aria-label={`Xóa ${attachment.filename}`}
				className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
			>
				{deleting ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					<Trash2 className="h-4 w-4" />
				)}
			</button>
		</div>
	);
}

export default function SubmissionAttachmentUploader({
	assignmentId,
	attachments: initialAttachments = [],
	onAttachmentsChange,
}: {
	assignmentId: string;
	attachments?: Attachment[];
	onAttachmentsChange?: (attachments: Attachment[]) => void;
}) {
	const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
	const [uploading, setUploading] = useState<UploadingFile[]>([]);
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	const [dragOver, setDragOver] = useState(false);
	const [error, setError] = useState("");
	const fileInputRef = useRef<HTMLInputElement>(null);

	const updateAttachments = useCallback(
		(next: Attachment[]) => {
			setAttachments(next);
			onAttachmentsChange?.(next);
		},
		[onAttachmentsChange],
	);

	function validateFile(file: File): string | null {
		if (!ACCEPTED_TYPES.includes(file.type)) {
			return `"${file.name}" không được hỗ trợ. Chỉ chấp nhận ảnh và PDF.`;
		}
		if (file.size > MAX_FILE_SIZE) {
			return `"${file.name}" vượt quá 10MB.`;
		}
		return null;
	}

	async function handleFiles(files: FileList | File[]) {
		setError("");
		const fileArray = Array.from(files);

		// Validate all files first
		for (const file of fileArray) {
			const validationError = validateFile(file);
			if (validationError) {
				setError(validationError);
				return;
			}
		}

		// Upload each file
		const uploadEntries: UploadingFile[] = fileArray.map((file) => ({
			file,
			progress: 0,
		}));
		setUploading((prev) => [...prev, ...uploadEntries]);

		for (let i = 0; i < fileArray.length; i++) {
			const file = fileArray[i];
			try {
				const result = await uploadAttachment(assignmentId, file, (progress) => {
					setUploading((prev) =>
						prev.map((u) => (u.file === file ? { ...u, progress } : u)),
					);
				});
				updateAttachments([...attachments, result]);
				setUploading((prev) => prev.filter((u) => u.file !== file));
			} catch (err) {
				setUploading((prev) =>
					prev.map((u) =>
						u.file === file
							? { ...u, error: err instanceof Error ? err.message : "Lỗi tải lên" }
							: u,
					),
				);
			}
		}
	}

	async function handleDelete(attachmentId: string) {
		setError("");
		setDeletingIds((prev) => new Set(prev).add(attachmentId));
		try {
			await deleteAttachment(assignmentId, attachmentId);
			const next = attachments.filter((a) => a.id !== attachmentId);
			updateAttachments(next);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Không thể xóa tệp");
		} finally {
			setDeletingIds((prev) => {
				const next = new Set(prev);
				next.delete(attachmentId);
				return next;
			});
		}
	}

	function handleDrop(e: React.DragEvent) {
		e.preventDefault();
		setDragOver(false);
		if (e.dataTransfer.files.length > 0) {
			void handleFiles(e.dataTransfer.files);
		}
	}

	function handleDragOver(e: React.DragEvent) {
		e.preventDefault();
		setDragOver(true);
	}

	function handleDragLeave(e: React.DragEvent) {
		e.preventDefault();
		setDragOver(false);
	}

	function dismissUploadError(file: File) {
		setUploading((prev) => prev.filter((u) => u.file !== file));
	}

	return (
		<div data-testid="submission-attachment-uploader" className="space-y-4">
			{/* Drop zone */}
			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onClick={() => fileInputRef.current?.click()}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
				}}
				aria-label="Kéo thả hoặc nhấn để tải tệp đính kèm"
				className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-colors ${
					dragOver
						? "border-blue-400 bg-blue-50"
						: "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100"
				}`}
			>
				<Upload className={`h-8 w-8 ${dragOver ? "text-blue-500" : "text-gray-400"}`} />
				<p className="text-sm text-gray-600">
					Kéo thả tệp vào đây hoặc <span className="font-semibold text-blue-600">nhấn để chọn</span>
				</p>
				<p className="text-xs text-gray-400">Ảnh hoặc PDF, tối đa 10MB</p>
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept="image/*,application/pdf"
				multiple
				className="hidden"
				onChange={(e) => {
					if (e.target.files && e.target.files.length > 0) {
						void handleFiles(e.target.files);
						e.target.value = "";
					}
				}}
			/>

			{/* Error */}
			{error && (
				<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					{error}
				</div>
			)}

			{/* Upload progress */}
			{uploading.length > 0 && (
				<div className="space-y-2">
					{uploading.map((item) => (
						<div
							key={item.file.name + item.file.lastModified}
							className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
						>
							<Loader2 className="h-5 w-5 animate-spin text-blue-500" />
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-gray-700">
									{item.file.name}
								</p>
								{item.error ? (
									<p className="text-xs text-red-600">{item.error}</p>
								) : (
									<div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
										<div
											className="h-full rounded-full bg-blue-500 transition-all"
											style={{ width: `${item.progress}%` }}
										/>
									</div>
								)}
							</div>
							{item.error && (
								<button
									type="button"
									onClick={() => dismissUploadError(item.file)}
									aria-label="Bỏ qua lỗi"
									className="rounded-lg p-1 text-gray-400 hover:text-gray-600"
								>
									<X className="h-4 w-4" />
								</button>
							)}
						</div>
					))}
				</div>
			)}

			{/* Attachment list */}
			{attachments.length > 0 && (
				<div className="space-y-2">
					{attachments.map((attachment) => (
						<AttachmentPreview
							key={attachment.id}
							attachment={attachment}
							onDelete={() => handleDelete(attachment.id)}
							deleting={deletingIds.has(attachment.id)}
						/>
					))}
				</div>
			)}
		</div>
	);
}
