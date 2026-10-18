# 📤 File Uploads & 📚 EDU Study Categories - Implementation Plan

**Date:** October 10, 2026  
**Status:** PLANNED (Ready for implementation)

---

## 1. File Upload System Requirements

### 1.1 Backend Endpoints Needed

```javascript
// Upload endpoints required:
POST /api/upload/avatar          // Profile pictures
POST /api/upload/document        // Identity docs, certificates
POST /api/upload/product         // Product images
POST /api/upload/course          // Course materials
POST /api/upload/store-banner    // Shop branding
DELETE /api/upload/:id           // Remove uploaded file
GET /api/files/:id               // Retrieve file

// Configuration
POST /api/upload/config          // Get upload limits
POST /api/upload/validate        // Pre-upload validation
```

### 1.2 Upload Limits

```
Avatar:          2 MB (image only: jpg, png, webp)
Documents:       10 MB (pdf, jpg, png, doc, docx)
Product Images:  5 MB each, max 10 images per product
Course Materials: 50 MB (pdf, mp4, zip, etc.)
Store Banner:    2 MB (jpg, png, webp)
Profile Photo:   2 MB (jpg, png, webp)
```

### 1.3 Storage Strategy

- **Local Development:** `/backend/uploads` directory
- **Production:** S3, Google Cloud Storage, or Cloudinary
- **CDN:** For image optimization and fast delivery
- **Database:** Store file metadata (size, type, checksum, URL)

### 1.4 Security Requirements

- ✅ Virus/malware scanning on upload
- ✅ File type validation (MIME type + extension check)
- ✅ Size limits enforced
- ✅ Filename sanitization (prevent path traversal)
- ✅ Access control (users can only access their files)
- ✅ Rate limiting (prevent abuse)
- ✅ Encryption at rest (optional, for sensitive documents)

---

## 2. Frontend Upload Components

### 2.1 Generic Upload Component

```typescript
// mallchain-os-v14/src/components/FileUpload.tsx
interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  maxSize?: number;           // in bytes
  accept?: string;             // MIME types
  label?: string;
  multiple?: boolean;
  dragAndDrop?: boolean;
}

Features:
- Drag and drop support
- File size validation
- MIME type checking
- Upload progress bar
- Error handling with user feedback
- Accessibility (keyboard nav, screen reader)
- Mobile-friendly
```

### 2.2 Avatar Upload

```typescript
// mallchain-os-v14/src/features/settings/AvatarUpload.tsx
- Square image preview
- Crop/resize options
- Replace existing avatar
- Progress indicator
- Fallback to initials if no image
```

### 2.3 Document Upload (KYC)

```typescript
// mallchain-os-v14/src/features/kyc/DocumentUpload.tsx
- Multi-page PDF support
- Document type selector
- Real-time validation
- Secure upload to temporary storage
```

### 2.4 Product Image Upload (Marketplace)

```typescript
// mallchain-os-v14/src/features/marketplace/ProductImageUpload.tsx
- Multiple image upload
- Drag and drop
- Image reordering
- Set primary image
- Delete individual images
```

### 2.5 Course Material Upload (EDU)

```typescript
// mallchain-os-v14/src/features/edu/CourseUpload.tsx
- Multi-file upload
- File type filtering
- Organizing by chapter/section
- Plagiarism detection (optional)
- Thumbnail generation for videos
```

---

## 3. EDU Study Categories Implementation

### 3.1 Category Structure

```typescript
interface StudyCategory {
  id: string;
  name: string;              // e.g., "Blockchain"
  description: string;
  icon: string;
  subcategories: Subcategory[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedHours: number;
}

interface Subcategory {
  id: string;
  name: string;              // e.g., "Smart Contracts"
  courseCount: number;
  prerequisites?: string[];
}
```

### 3.2 Study Categories to Create

#### **BLOCKCHAIN** (Advanced)
- Bitcoin Fundamentals
- Ethereum & Smart Contracts
- DeFi Protocols
- Layer 2 Solutions
- Consensus Mechanisms
- Cryptography Basics
- NFTs & Token Standards
- Blockchain Security

#### **PROGRAMMING** (Beginner → Advanced)
- **JavaScript/Web:**
  - JavaScript Fundamentals
  - React & Frontend
  - Node.js & Backend
  - Web3.js Integration
  
- **Solidity:**
  - Solidity Basics
  - Smart Contract Patterns
  - Security Best Practices
  - Testing & Deployment
  
- **Python:**
  - Python Fundamentals
  - Data Science with Python
  - Automation Scripts
  - Web Scraping

#### **FINANCE** (Intermediate)
- Trading Basics
- Technical Analysis
- Fundamental Analysis
- Risk Management
- Portfolio Management
- Cryptocurrency Markets
- Derivatives Trading
- Tax Planning

#### **BUSINESS** (Intermediate)
- Entrepreneurship 101
- Business Planning
- Marketing Fundamentals
- Sales Techniques
- Leadership Skills
- Team Management
- Financial Planning
- Scaling a Business

#### **SCIENCE** (All Levels)
- **Mathematics:**
  - Algebra
  - Geometry
  - Calculus
  - Statistics & Probability
  
- **Physics:**
  - Classical Mechanics
  - Thermodynamics
  - Electromagnetism
  - Modern Physics
  
- **Chemistry:**
  - General Chemistry
  - Organic Chemistry
  - Biochemistry
  
- **Biology:**
  - Cell Biology
  - Genetics
  - Ecology
  - Human Anatomy

#### **LANGUAGES** (All Levels)
- English (Speaking, Writing, Grammar)
- Spanish (Beginner to Advanced)
- French (Beginner to Advanced)
- Mandarin Chinese
- Arabic

#### **TECHNOLOGY** (Intermediate)
- Cloud Computing (AWS, Google Cloud, Azure)
- Cybersecurity Fundamentals
- DevOps & Docker
- Artificial Intelligence & ML
- Data Engineering
- System Design

#### **PROFESSIONAL** (Various)
- Professional Development
- Communication Skills
- Time Management
- Public Speaking
- Negotiation Skills

### 3.3 Database Schema

```typescript
// Backend model
interface StudyCourse {
  _id: ObjectId;
  categoryId: string;
  subcategoryId?: string;
  title: string;
  description: string;
  instructor: ObjectId;           // Reference to User
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number;               // minutes
  modules: Module[];
  materials: UploadedFile[];      // PDFs, videos, etc.
  createdAt: Date;
  updatedAt: Date;
  published: boolean;
  enrollCount: number;
  rating: number;                 // average 1-5
  tags: string[];
}

interface Module {
  _id: ObjectId;
  title: string;
  lessons: Lesson[];
  order: number;
}

interface Lesson {
  _id: ObjectId;
  title: string;
  content: string;
  videoUrl?: string;
  materialId?: ObjectId;          // Reference to uploaded file
  duration: number;               // minutes
  order: number;
}
```

---

## 4. Frontend Routes for EDU

```
/edu                          - EDU hub/explore page
/edu/categories               - Browse all categories
/edu/category/:categoryId     - View category & courses
/edu/course/:courseId         - Take course
/edu/my-courses               - Enrolled courses
/edu/create                   - Create new course (instructors)
/edu/upload                   - Upload course materials
/edu/certificates             - Earned certificates
```

---

## 5. Wallet Feature Uploads

### 5.1 Backup Upload
```typescript
// mallchain-os-v14/src/features/wallet/BackupUpload.tsx
- Upload encrypted backup file
- Verify backup integrity
- Restore wallet from backup
- Version history of backups
```

### 5.2 Wallet Avatar/Profile
```typescript
// Already in place, just needs file upload wired
- Custom wallet name
- Custom wallet icon/avatar
- Wallet description (optional)
```

---

## 6. Marketplace Upload Features

### 6.1 Product Upload
```typescript
// mallchain-os-v14/src/features/marketplace/ProductCreate.tsx
- Product images (multiple)
- Product description
- Category selection
- Price & inventory
- Shipping info

Features:
- Image preview
- Drag & drop reordering
- Auto-compression
- CDN serving
```

### 6.2 Store Avatar & Banner
```typescript
// mallchain-os-v14/src/features/marketplace/StoreSettings.tsx
- Store logo/avatar
- Store banner image
- Store branding
- Social links
```

---

## 7. Implementation Priority

### Phase 1 (Week 1) - Core Upload System
- [ ] Backend upload endpoints
- [ ] File validation & storage
- [ ] Generic FileUpload component
- [ ] Avatar upload in Settings

### Phase 2 (Week 2) - EDU & Marketplace
- [ ] EDU categories database
- [ ] Course upload UI
- [ ] Product image upload
- [ ] Material file upload

### Phase 3 (Week 3) - Advanced Features
- [ ] Video processing
- [ ] Image optimization/CDN
- [ ] Plagiarism detection
- [ ] Analytics & reporting

---

## 8. File Upload API Example

### Backend Implementation (Express)

```javascript
// backend/src/routes/upload.js
const multer = require('multer');
const sharp = require('sharp');

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Avatar upload with compression
router.post('/avatar', requireAuth(), upload.single('avatar'), async (req, res) => {
  try {
    // Compress image
    const buffer = await sharp(req.file.path)
      .resize(200, 200)
      .webp({ quality: 80 })
      .toBuffer();
    
    // Save to storage
    const fileId = await saveFile(buffer, 'webp');
    
    // Update user
    await User.findByIdAndUpdate(req.user._id, {
      avatarUrl: `/uploads/${fileId}`
    });
    
    res.json({ ok: true, url: `/uploads/${fileId}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

### Frontend Implementation (React)

```typescript
// mallchain-os-v14/src/components/FileUpload.tsx
export function FileUpload({ onUpload, accept, maxSize }: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    await uploadFile(files[0]);
  };

  const uploadFile = async (file: File) => {
    if (file.size > (maxSize || 10_000_000)) {
      alert('File too large');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload/avatar', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        const data = await res.json();
        onUpload(data.url);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <input type="file" accept={accept} onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} />
      {uploading && <progress value={progress} max={100} />}
    </div>
  );
}
```

---

## 9. Success Criteria

### File Upload System
- ✅ Users can upload files (avatars, documents, products, courses)
- ✅ File validation (type, size, content)
- ✅ Secure storage & access control
- ✅ Progress tracking & error handling
- ✅ Mobile-friendly upload
- ✅ CDN serving for performance

### EDU System
- ✅ All study categories populated
- ✅ Instructors can create courses
- ✅ Students can browse & enroll
- ✅ Course materials upload working
- ✅ Certificates issued on completion
- ✅ Search/filter by category & difficulty

---

## 10. Summary

### What's Required
- ✅ Backend upload endpoints
- ✅ Frontend FileUpload component
- ✅ EDU database & routes
- ✅ Study category data
- ✅ Course management UI
- ✅ File storage & CDN

### Timeline
- **Phase 1:** 1 week (core uploads)
- **Phase 2:** 1 week (EDU + marketplace)
- **Phase 3:** 1 week (advanced features)

### Resources
- Multer (Node.js file upload)
- Sharp (image processing)
- AWS S3 / Cloudinary (cloud storage)
- ClamAV (virus scanning)

**Ready to proceed with implementation. Let me know which component to build first!**
