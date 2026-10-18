# 🚀 QUICK START GUIDE — File Uploads Integration

**Updated:** October 10, 2026  
**Status:** ✅ Avatar upload LIVE in Settings

---

## ⚡ 5-MINUTE TEST

### 1. Start Servers (if not running):
```bash
# Terminal 1
cd backend && npm start

# Terminal 2  
cd mallchain-os-v14 && npm run dev
```

### 2. Open App:
```
http://localhost:5173
```

### 3. Login:
- Use any test account or create new one
- Complete any authentication steps

### 4. Go to Settings:
```
Click user icon → Settings → Edit Profile
```

### 5. Test Avatar Upload:
- You'll see "Upload Avatar" section with:
  - Current avatar or initials
  - Drag & drop zone
  - "Choose Avatar" button
- Select/drag a JPG, PNG, or WebP image (max 2MB)
- Watch the progress bar
- See success message ✅
- Avatar updates immediately!

---

## 🎯 NEXT INTEGRATION (Marketplace Product Images)

### Step 1: Create Component
**File:** `mallchain-os-v14/src/features/marketplace/ProductImageUpload.tsx`

```typescript
import React, { useState } from 'react';
import FileUpload from '../../components/FileUpload';

interface ProductImageUploadProps {
  onImagesChange?: (urls: string[]) => void;
}

export function ProductImageUpload({ onImagesChange }: ProductImageUploadProps) {
  const [images, setImages] = useState<string[]>([]);

  const handleImageUpload = (file: File, url: string) => {
    const newImages = [...images, url];
    setImages(newImages);
    onImagesChange?.(newImages);
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onImagesChange?.(newImages);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 12 }}>Product Images</h3>
      
      <FileUpload
        onUpload={handleImageUpload}
        maxSize={5 * 1024 * 1024}
        accept="image/jpeg,image/png,image/webp"
        label="Upload Product Image"
        category="product"
        dragAndDrop={true}
      />

      {images.length > 0 && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
          {images.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img 
                src={url} 
                alt={`Product ${i + 1}`}
                style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8 }}
              />
              <button
                onClick={() => removeImage(i)}
                style={{
                  position: 'absolute',
                  top: 4, right: 4,
                  background: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="tiny" style={{ marginTop: 12, color: 'var(--txt-3)' }}>
        Upload up to 10 images, max 5MB each
      </div>
    </div>
  );
}

export default ProductImageUpload;
```

### Step 2: Integrate into Product Create Page
**File:** `mallchain-os-v14/src/features/marketplace/ProductCreate.tsx`

```typescript
import { ProductImageUpload } from './ProductImageUpload';

export function ProductCreate() {
  const [productImages, setProductImages] = useState<string[]>([]);

  // ... other state ...

  const handleCreateProduct = async () => {
    // Submit with productImages array
    const product = {
      name: productName,
      description: productDescription,
      price: productPrice,
      images: productImages,  // ← Include images
      // ... other fields ...
    };

    const res = await marketplaceApi.createProduct(product);
    // ... handle response ...
  };

  return (
    <div>
      <h1>Create Product</h1>
      
      {/* ... other fields ... */}

      {/* Add this section */}
      <ProductImageUpload 
        onImagesChange={setProductImages}
      />

      <button onClick={handleCreateProduct}>
        Create Product
      </button>
    </div>
  );
}
```

### Step 3: Test It
1. Go to Marketplace → Create Product
2. Fill in product details
3. Scroll to "Product Images" section
4. Upload 1-10 images
5. Drag to reorder (future enhancement)
6. Click remove (✕) to delete individual images
7. Create product → images sent to backend

---

## 🏪 STORE BRANDING (1 hour)

### Create Component:
**File:** `mallchain-os-v14/src/features/marketplace/StoreBranding.tsx`

```typescript
import React, { useState } from 'react';
import FileUpload from '../../components/FileUpload';

export function StoreBranding({ 
  currentLogo, 
  currentBanner,
  onUpdate 
}: {
  currentLogo?: string;
  currentBanner?: string;
  onUpdate: (logo?: string, banner?: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handleLogoUpload = async (file: File, url: string) => {
    setLoading(true);
    await onUpdate(url, currentBanner);
    setLoading(false);
  };

  const handleBannerUpload = async (file: File, url: string) => {
    setLoading(true);
    await onUpdate(currentLogo, url);
    setLoading(false);
  };

  return (
    <div>
      <h2>Store Branding</h2>

      {/* Store Logo */}
      <div style={{ marginBottom: 32 }}>
        <h3>Store Logo</h3>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          {currentLogo && (
            <div>
              <img src={currentLogo} style={{ width: 80, height: 80, objectFit: 'contain' }} />
              <div className="tiny">Current logo</div>
            </div>
          )}
        </div>
        <FileUpload
          onUpload={handleLogoUpload}
          maxSize={2 * 1024 * 1024}
          accept="image/jpeg,image/png,image/webp"
          label="Upload Store Logo"
          category="avatar"
        />
      </div>

      {/* Store Banner */}
      <div>
        <h3>Store Banner</h3>
        <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
          {currentBanner && (
            <div>
              <img src={currentBanner} style={{ width: 200, height: 100, objectFit: 'cover', borderRadius: 4 }} />
              <div className="tiny">Current banner</div>
            </div>
          )}
        </div>
        <FileUpload
          onUpload={handleBannerUpload}
          maxSize={2 * 1024 * 1024}
          accept="image/jpeg,image/png,image/webp"
          label="Upload Store Banner"
          category="store"
        />
      </div>

      <div className="tiny" style={{ marginTop: 24, color: 'var(--txt-3)' }}>
        💡 Logo recommended: 200x200px • Banner recommended: 1200x400px
      </div>
    </div>
  );
}
```

---

## 💾 WALLET BACKUP (1-2 hours)

### Create Component:
**File:** `mallchain-os-v14/src/features/wallet/WalletBackup.tsx`

```typescript
import React, { useState } from 'react';
import FileUpload from '../../components/FileUpload';

export function WalletBackup() {
  const [restoring, setRestoring] = useState(false);

  const handleBackupUpload = async (file: File, url: string) => {
    setRestoring(true);
    
    try {
      // Download and verify backup
      const response = await fetch(url);
      const backupData = await response.json();
      
      // Validate backup format
      if (!backupData.mnemonic || !backupData.wallet) {
        throw new Error('Invalid backup file format');
      }

      // Restore wallet from backup
      // ... restore logic ...
      
      console.log('Wallet restored successfully!');
    } catch (err) {
      console.error('Restore failed:', err);
    }
    
    setRestoring(false);
  };

  return (
    <div>
      <h2>Wallet Backup & Recovery</h2>
      
      <div style={{ padding: 16, background: 'var(--surface-alt)', borderRadius: 8, marginBottom: 24 }}>
        <h3>Restore from Backup</h3>
        <p className="tiny" style={{ marginBottom: 12 }}>
          Upload your encrypted wallet backup file to restore your wallet
        </p>
        
        <FileUpload
          onUpload={handleBackupUpload}
          accept=".json,.backup"
          label="Select Backup File"
          disabled={restoring}
        />
      </div>

      <div className="tiny" style={{ color: 'var(--txt-3)' }}>
        ⚠️ Only upload encrypted backup files from trusted sources
      </div>
    </div>
  );
}
```

---

## 🎓 EDU COURSE MATERIALS (Phase 2)

### Will use same FileUpload component:

```typescript
import FileUpload from '@/components/FileUpload';

<FileUpload
  onUpload={(file, url) => addCourseMaterial(url, file.type)}
  maxSize={50 * 1024 * 1024}           // 50MB for videos
  accept=".pdf,.mp4,.zip,.jpg,.png,.txt,.md"
  label="Upload Course Material"
  category="course"
  multiple={true}                      // Allow multiple uploads
  onProgress={(percent) => {
    console.log(`Upload ${percent}% complete`);
  }}
/>
```

---

## 📊 INTEGRATION TIMELINE

### Today (2-3 hours):
- [ ] Product image upload component
- [ ] Integrate into Marketplace
- [ ] Test multi-image uploads
- [ ] Verify in production build

### Tomorrow (1-2 hours):
- [ ] Store branding component
- [ ] Integrate into Store settings
- [ ] Test logo + banner upload

### This Week (1-2 days):
- [ ] Wallet backup upload
- [ ] Recovery functionality
- [ ] EDU course materials structure

### Next Week:
- [ ] Advanced features
- [ ] Video processing
- [ ] Image optimization

---

## ✅ TESTING CHECKLIST

After each integration:

### File Upload Tests:
- [ ] Can upload single file
- [ ] Can upload multiple files
- [ ] Drag & drop works
- [ ] Progress bar shows
- [ ] File validation works (size limit)
- [ ] File validation works (type)
- [ ] Success message displays
- [ ] Error message displays

### UI Tests:
- [ ] Component renders correctly
- [ ] Mobile responsive
- [ ] Dark mode looks good
- [ ] Keyboard navigation works
- [ ] Screen reader works

### Backend Tests:
- [ ] File stored correctly
- [ ] URL returned properly
- [ ] File accessible via HTTP
- [ ] File size correct
- [ ] User authentication verified

### Integration Tests:
- [ ] Data saved to database
- [ ] Can retrieve uploaded files
- [ ] Multiple uploads don't conflict
- [ ] Previous uploads unaffected
- [ ] Delete functionality works

---

## 🐛 TROUBLESHOOTING

### "File too large" error:
- Check file size vs maxSize prop
- Avatar: max 2MB
- Product: max 5MB
- Course: max 50MB

### "Invalid file type" error:
- Check accept prop (MIME types)
- Verify file extension matches type
- Example: `.jpg` file must have `image/jpeg` MIME

### Upload succeeds but file not visible:
- Check backend/uploads/ directory
- Verify HTTP status 200
- Check response includes URL
- Try refresh browser (Ctrl+F5)

### CORS error:
- Already configured in backend
- Restart backend if you changed .env
- Check CORS_ORIGINS includes your domain

---

## 💡 QUICK REFERENCE

### Endpoint URLs:
```
POST /api/upload/avatar           → /uploads/avatars/{filename}
POST /api/upload/product          → /uploads/products/{filename}
POST /api/upload/store-banner     → /uploads/store/{filename}
POST /api/upload/config           → Returns limits & types
```

### File Storage Paths:
```
backend/uploads/
├── avatars/       ← User profile pictures
├── products/      ← Product images
├── store/         ← Store banners
├── courses/       ← Course materials
└── documents/     ← Identity docs
```

### Component Props:
```typescript
interface FileUploadProps {
  onUpload: (file: File, url: string) => Promise<void>;
  maxSize?: number;           // bytes
  accept?: string;             // MIME types
  label?: string;
  multiple?: boolean;
  dragAndDrop?: boolean;
  category?: 'avatar' | 'product' | 'document' | 'course' | 'store';
  onError?: (error: string) => void;
  onProgress?: (progress: number) => void;
  disabled?: boolean;
  className?: string;
}
```

---

## 🎬 READY TO BUILD!

All infrastructure is in place. Components are ready to integrate. Documentation is complete.

**Pick any integration from above and start building!**

Questions? Check:
- `FILE_UPLOADS_IMPLEMENTATION_STATUS.md` — Full details
- `UPLOADS_INTEGRATION_COMPLETE.md` — Testing guide
- `SYSTEM_STATUS_SUMMARY.md` — Overall status

**Let's go! 🚀**

