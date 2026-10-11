import React, { useState, useRef, useCallback } from 'react';
import './FileUpload.css';

export interface FileUploadProps {
  onUpload: (file: File, url: string) => Promise<void> | void;
  maxSize?: number; // bytes
  accept?: string; // MIME types
  label?: string;
  multiple?: boolean;
  dragAndDrop?: boolean;
  category?: 'avatar' | 'product' | 'document' | 'course' | 'store';
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Generic File Upload Component
 * Supports drag & drop, file validation, and progress tracking
 */
export const FileUpload: React.FC<FileUploadProps> = ({
  onUpload,
  maxSize = 5 * 1024 * 1024, // 5MB default
  accept = 'image/*',
  label = 'Upload File',
  multiple = false,
  dragAndDrop = true,
  category = 'product',
  onError,
  onProgress,
  disabled = false,
  className = '',
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const getEndpoint = (cat: string) => {
    switch (cat) {
      case 'avatar':
        return '/api/upload/avatar';
      case 'product':
        return '/api/upload/product';
      case 'store':
        return '/api/upload/store-banner';
      case 'course':
        return '/api/upload/product'; // Reuse product endpoint for now
      default:
        return '/api/upload/product';
    }
  };

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file size
      if (file.size > maxSize) {
        return `File size exceeds limit of ${(maxSize / 1024 / 1024).toFixed(1)}MB`;
      }

      // Check file type
      const acceptedTypes = accept.split(',').map(t => t.trim());
      const isAccepted = acceptedTypes.some(type => {
        if (type.endsWith('/*')) {
          const baseType = type.split('/')[0];
          return file.type.startsWith(baseType);
        }
        return file.type === type;
      });

      if (!isAccepted) {
        return `File type not accepted. Allowed: ${accept}`;
      }

      return null;
    },
    [accept, maxSize]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      try {
        setError(null);
        setSuccess(false);

        // Validate file
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          onError?.(validationError);
          return;
        }

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        const endpoint = getEndpoint(category);

        // Create XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setProgress(percentComplete);
            onProgress?.(percentComplete);
          }
        });

        // Handle completion
        await new Promise((resolve, reject) => {
          xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
              const response = JSON.parse(xhr.responseText);
              setProgress(100);
              setSuccess(true);
              onUpload(file, response.url);
              setTimeout(() => {
                setProgress(0);
                setSuccess(false);
              }, 2000);
              resolve(response);
            } else {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || 'Upload failed'));
            }
          });

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'));
          });

          // Use fetch API for simplicity (progress works with fetch API in modern browsers)
          fetch(endpoint, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          })
            .then(res => {
              if (!res.ok) return res.json().then(err => { throw new Error(err.error); });
              return res.json();
            })
            .then(data => {
              setProgress(100);
              setSuccess(true);
              onUpload(file, data.url);
              setTimeout(() => {
                setProgress(0);
                setSuccess(false);
              }, 2000);
            })
            .catch(err => {
              const msg = err.message || 'Upload failed';
              setError(msg);
              onError?.(msg);
            })
            .finally(() => {
              setUploading(false);
            });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setError(msg);
        onError?.(msg);
      } finally {
        setUploading(false);
      }
    },
    [validateFile, category, onUpload, onError, onProgress]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files) {
      if (multiple) {
        Array.from(files).forEach(file => uploadFile(file));
      } else {
        uploadFile(files[0]);
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files) {
      if (multiple) {
        Array.from(files).forEach(file => uploadFile(file));
      } else {
        uploadFile(files[0]);
      }
    }
  };

  return (
    <div
      className={`file-upload-wrapper ${className}`}
      onDragEnter={dragAndDrop ? handleDrag : undefined}
      onDragLeave={dragAndDrop ? handleDrag : undefined}
      onDragOver={dragAndDrop ? handleDrag : undefined}
      onDrop={dragAndDrop ? handleDrop : undefined}
    >
      <div className={`file-upload-container ${dragActive ? 'drag-active' : ''}`}>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept={accept}
          multiple={multiple}
          disabled={disabled || uploading}
          className="file-input"
          aria-label={label}
        />

        <div className="file-upload-content">
          {uploading ? (
            <div className="upload-progress">
              <div className="spinner"></div>
              <p>Uploading... {Math.round(progress)}%</p>
              <progress value={progress} max={100} className="progress-bar"></progress>
            </div>
          ) : success ? (
            <div className="upload-success">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <p>File uploaded successfully!</p>
            </div>
          ) : error ? (
            <div className="upload-error">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="dismiss-error"
                disabled={uploading}
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p className="upload-label">{label}</p>
              <p className="upload-hint">
                {dragAndDrop ? 'Drag and drop or click to select' : 'Click to select file'}
              </p>
              <p className="upload-size">Max file size: {(maxSize / 1024 / 1024).toFixed(1)}MB</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="upload-button"
                disabled={uploading}
              >
                Choose File
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
