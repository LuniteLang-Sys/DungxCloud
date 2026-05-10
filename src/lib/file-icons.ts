import { 
  File, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  FileText, 
  FileCode, 
  FileArchive, 
  FileSpreadsheet, 
  Presentation,
  Database,
  Terminal,
  LucideIcon,
  Type,
  Music,
  Video,
  Image,
  Cpu,
  Settings,
  Shield,
  Layers,
  Box,
  Globe,
  FileJson,
  FileEdit,
  Binary,
  Folder
} from 'lucide-react';

interface FileIconInfo {
  icon: LucideIcon;
  bgColor: string;     // CSS background color
  textColor: string;   // CSS text/stroke color
  label: string;       // Human-readable type
}

export function getFileIconInfo(mimeType: string | undefined, fileName: string): FileIconInfo {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';

  // 0. Folders (application/vnd.google-apps.folder)
  if (mimeType === 'application/vnd.google-apps.folder') {
    return {
      icon: Folder,
      bgColor: '#fff8e1',
      textColor: '#d97706', // Warm amber-600
      label: 'Folder'
    };
  }

  // 1. Word Documents (.docx, .doc, .odt, .rtf, .dot, .dotx)
  if (
    ['docx', 'doc', 'odt', 'rtf', 'dot', 'dotx'].includes(extension) || 
    mimeType?.includes('word') || 
    mimeType?.includes('officedocument.wordprocessingml')
  ) {
    return {
      icon: FileText,
      bgColor: '#e3f2fd', // Light Blue
      textColor: '#0d47a1', // Deep Blue
      label: 'Word Document'
    };
  }

  // 2. Spreadsheets (.xlsx, .xls, .ods, .csv, .xlt, .xltx, .tsv)
  if (
    ['xlsx', 'xls', 'ods', 'csv', 'xlt', 'xltx', 'tsv'].includes(extension) || 
    mimeType?.includes('sheet') || 
    mimeType?.includes('excel') || 
    mimeType?.includes('officedocument.spreadsheetml')
  ) {
    return {
      icon: FileSpreadsheet,
      bgColor: '#e8f5e9', // Light Green
      textColor: '#1b5e20', // Forest Green
      label: 'Excel Spreadsheet'
    };
  }

  // 3. Presentations (.pptx, .ppt, .odp, .pot, .potx)
  if (
    ['pptx', 'ppt', 'odp', 'pot', 'potx'].includes(extension) || 
    mimeType?.includes('presentation') || 
    mimeType?.includes('powerpoint') || 
    mimeType?.includes('officedocument.presentationml')
  ) {
    return {
      icon: Presentation,
      bgColor: '#fbe9e7', // Light Orange
      textColor: '#d84315', // Rust Red/Orange
      label: 'PowerPoint Presentation'
    };
  }

  // 4. PDF Files (.pdf)
  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return {
      icon: FileText,
      bgColor: '#ffebee', // Light Red
      textColor: '#c62828', // Crimson Red
      label: 'PDF Document'
    };
  }

  // 5. Archives / Compressed Files (.zip, .rar, .7z, .tar, .gz, .bz2, .xz, .iso, .dmg)
  if (
    ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'].includes(extension) || 
    mimeType?.includes('zip') || 
    mimeType?.includes('compressed') || 
    mimeType?.includes('tar') || 
    mimeType?.includes('rar') || 
    mimeType?.includes('archive')
  ) {
    return {
      icon: FileArchive,
      bgColor: '#f3e5f5', // Light Purple
      textColor: '#6a1b9a', // Deep Purple
      label: 'Compressed Archive'
    };
  }

  // 6. Source Code (.js, .ts, .jsx, .tsx, .json, .html, .css, .py, .java, .cpp, .c, .go, .sh, .php, .rb, .sql, .yaml, .yml, .rs, .swift, .kt)
  if (
    ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'go', 'sh', 'php', 'rb', 'sql', 'yaml', 'yml', 'rs', 'swift', 'kt', 'vue', 'astro'].includes(extension) ||
    mimeType?.includes('javascript') || 
    mimeType?.includes('json') || 
    mimeType?.includes('code') || 
    mimeType?.startsWith('text/html') || 
    mimeType?.startsWith('text/css')
  ) {
    return {
      icon: FileCode,
      bgColor: '#f1f5f9', // Slate Gray
      textColor: '#475569', // Slate Dark
      label: 'Source Code'
    };
  }

  // 7. Images (.png, .jpg, .jpeg, .gif, .webp, .svg, .bmp, .tiff, .avif, .heic)
  if (
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'avif', 'heic'].includes(extension) || 
    mimeType?.startsWith('image/')
  ) {
    return {
      icon: FileImage,
      bgColor: '#fce4ec', // Light Pink
      textColor: '#c2185b', // Hot Pink
      label: 'Image File'
    };
  }

  // 8. Videos (.mp4, .mkv, .avi, .mov, .webm, .flv, .wmv, .m4v, .3gp)
  if (
    ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', '3gp'].includes(extension) || 
    mimeType?.startsWith('video/')
  ) {
    return {
      icon: FileVideo,
      bgColor: '#ede7f6', // Light Indigo
      textColor: '#4527a0', // Deep Indigo
      label: 'Video Media'
    };
  }

  // 9. Audio (.mp3, .wav, .ogg, .flac, .aac, .m4a, .wma, .aiff)
  if (
    ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'aiff'].includes(extension) || 
    mimeType?.startsWith('audio/')
  ) {
    return {
      icon: FileAudio,
      bgColor: '#e0f2f1', // Light Teal
      textColor: '#00695c', // Deep Teal
      label: 'Audio Stream'
    };
  }

  // 10. Database Files (.db, .sqlite, .sql, .mdb, .accdb, .pgsql, .mysql)
  if (
    ['db', 'sqlite', 'sql', 'mdb', 'accdb', 'pgsql', 'mysql'].includes(extension) || 
    mimeType?.includes('database') || 
    mimeType?.includes('sqlite')
  ) {
    return {
      icon: Database,
      bgColor: '#e0f7fa', // Light Cyan
      textColor: '#00838f', // Dark Cyan
      label: 'Database File'
    };
  }

  // 11. Executables / Scripts / Binaries (.exe, .msi, .apk, .dmg, .bin, .bat, .ps1, .sh, .cmd)
  if (
    ['exe', 'msi', 'apk', 'dmg', 'bin', 'bat', 'ps1', 'cmd'].includes(extension)
  ) {
    return {
      icon: Terminal,
      bgColor: '#fafafa', // Light Gray-White
      textColor: '#212121', // Jet Black
      label: 'Executable Program'
    };
  }

  // 12. Design Files (.psd, .ai, .fig, .sketch, .xd)
  if (
    ['psd', 'ai', 'fig', 'sketch', 'xd'].includes(extension)
  ) {
    return {
      icon: Layers,
      bgColor: '#fff3e0', // Light Amber
      textColor: '#e65100', // Deep Orange
      label: 'Design File'
    };
  }

  // 13. Font Files (.ttf, .otf, .woff, .woff2, .eot)
  if (
    ['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(extension) ||
    mimeType?.includes('font')
  ) {
    return {
      icon: Type,
      bgColor: '#f5f5f5', 
      textColor: '#424242',
      label: 'Font File'
    };
  }

  // 14. 3D Models (.obj, .stl, .fbx, .glb, .gltf)
  if (
    ['obj', 'stl', 'fbx', 'glb', 'gltf'].includes(extension) ||
    mimeType?.includes('model')
  ) {
    return {
      icon: Box,
      bgColor: '#f3e5f5',
      textColor: '#4a148c',
      label: '3D Model'
    };
  }

  // 15. Text/Plain (.txt, .log, .md, .ini, .conf)
  if (
    ['txt', 'log', 'md', 'ini', 'conf', 'csv'].includes(extension) || 
    mimeType?.startsWith('text/plain')
  ) {
    return {
      icon: FileText,
      bgColor: '#f9fafb', // Clean Off-White
      textColor: '#374151', // Dark Gray
      label: 'Text Document'
    };
  }

  // 16. Generic Fallback
  return {
    icon: File,
    bgColor: '#ffffff',
    textColor: '#1f2937',
    label: 'Document File'
  };
}

// Keep backward compatibility for getFileIcon
export function getFileIcon(mimeType: string | undefined, fileName: string) {
  return getFileIconInfo(mimeType, fileName).icon;
}
