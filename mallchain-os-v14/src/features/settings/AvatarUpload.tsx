import React, { useState } from 'react';
import FileUpload from '../../components/FileUpload';
import './AvatarUpload.css';

interface AvatarUploadProps {
  currentAvatar?: string;
  onAvatarChange?: (url: string) => void;
  userName?: string;
}

/**
 * Avatar Upload Component
 * Allows users to upload and preview their profile avatar
 */
export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatar,
  onAvatarChange,
  userName = 'User',
}) => {
  const [preview, setPreview] = useState<string | null>(currentAvatar || null);
  const [error, setError] = useState<string | null>(null);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleAvatarUpload = async (file: File, url: string) => {
    try {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setPreview(result);
      };
      reader.readAsDataURL(file);

      // Call parent callback
      onAvatarChange?.(url);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update avatar';
      setError(msg);
    }
  };

  return (
    <div className="avatar-upload-container">
      <div className="avatar-display">
        {preview ? (
          <img src={preview} alt="Avatar" className="avatar-image" />
        ) : (
          <div className="avatar-initials">
            {getInitials(userName)}
          </div>
        )}
      </div>

      <div className="avatar-upload-section">
        <h3>Upload Avatar</h3>
        <p className="avatar-hint">
          Choose a profile picture (JPG, PNG, or WebP, max 2MB)
        </p>

        <FileUpload
          onUpload={handleAvatarUpload}
          maxSize={2 * 1024 * 1024}
          accept="image/jpeg,image/png,image/webp"
          label="Choose Avatar"
          category="avatar"
          onError={setError}
          dragAndDrop={true}
          className="avatar-upload"
        />

        {error && (
          <div className="avatar-error">
            <span>{error}</span>
          </div>
        )}

        <div className="avatar-tips">
          <p className="tips-title">Tips for best results:</p>
          <ul>
            <li>Use a clear, recent photo</li>
            <li>Make sure your face is visible</li>
            <li>Good lighting makes a difference</li>
            <li>Recommended size: 400x400 pixels</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AvatarUpload;
