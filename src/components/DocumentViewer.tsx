'use client'

import { useEffect, useState } from 'react'
import {
  DocumentIcon,
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  LockOpenIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  XMarkIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { DocumentMetadata, getIPFSUrl, canAccessDocument } from '@/lib/ipfs'
import { useDocumentContent } from '@/hooks/useDocument'
import { formatFileSize } from '@/lib/utils'

interface DocumentViewerProps {
  doc: DocumentMetadata
  userAddress: string
  userRoles?: string[]
  onClose?: () => void
  onError?: (error: string) => void
  className?: string
}

export default function DocumentViewer({
  doc,
  userAddress,
  userRoles = [],
  onClose,
  onError,
  className = ''
}: DocumentViewerProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  // Check if user has access
  const hasAccess = canAccessDocument(doc, userAddress, userRoles)

  const { content, loading, error: loadError, decrypted, previewUrl, decrypt } =
    useDocumentContent(doc, userAddress, userRoles)
  const error = passwordError || loadError

  useEffect(() => {
    if (loadError) onError?.(loadError)
  }, [loadError, onError])

  const handleDecrypt = () => {
    if (!password.trim()) {
      setPasswordError('Password is required to decrypt this doc')
      return
    }
    setPasswordError('')
    decrypt(password)
  }

  const downloadDocument = () => {
    if (!content) return

    const blob = new Blob([new Uint8Array(content)], { type: doc.type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = doc.name
    link.click()
    URL.revokeObjectURL(url)
  }

  const shareDocument = async () => {
    if (navigator.share && previewUrl) {
      try {
        await navigator.share({
          title: doc.name,
          text: `Document: ${doc.name}`,
          url: previewUrl
        })
      } catch {
        // Fallback to clipboard
        copyToClipboard()
      }
    } else {
      copyToClipboard()
    }
  }

  const copyToClipboard = () => {
    const url = getIPFSUrl(doc.hash)
    navigator.clipboard.writeText(url).then(() => {
      // Show success message
      const originalText = 'Share'
      const button = document.querySelector('[data-share-button]') as HTMLButtonElement
      if (button) {
        button.textContent = 'Copied!'
        setTimeout(() => {
          button.textContent = originalText
        }, 2000)
      }
    })
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️'
    if (type.startsWith('video/')) return '🎥'
    if (type.startsWith('audio/')) return '🎵'
    if (type.includes('pdf')) return '📄'
    if (type.includes('text')) return '📝'
    if (type.includes('zip') || type.includes('rar')) return '📦'
    return '📁'
  }

  const canPreview = (type: string) => {
    return type.startsWith('image/') || 
           type.startsWith('text/') || 
           type.includes('pdf') ||
           type.startsWith('video/') ||
           type.startsWith('audio/')
  }

  const renderPreview = () => {
    if (!previewUrl || !content) return null

    if (doc.type.startsWith('image/')) {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- previewUrl is a blob: URL (URL.createObjectURL) which next/image cannot optimize; using <img> with explicit dimensions and lazy-loading to avoid layout shift
        <img
          src={previewUrl}
          alt={doc.name}
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
          style={{ maxWidth: '100%', height: 'auto', maxHeight: '24rem' }}
          className="mx-auto rounded-lg shadow-lg"
        />
      )
    }

    if (doc.type.startsWith('text/')) {
      const text = new TextDecoder().decode(content)
      return (
        <div className="bg-muted rounded-lg p-4 max-h-96 overflow-auto">
          <pre className="whitespace-pre-wrap text-sm text-foreground">
            {text.slice(0, 5000)}{text.length > 5000 && '...'}
          </pre>
        </div>
      )
    }

    if (doc.type.includes('pdf')) {
      return (
        <iframe
          src={previewUrl}
          className="w-full h-96 rounded-lg border border-input"
          title={doc.name}
        />
      )
    }

    if (doc.type.startsWith('video/')) {
      return (
        <video
          src={previewUrl}
          controls
          className="max-w-full max-h-96 mx-auto rounded-lg shadow-lg"
          aria-label={doc.name}
        >
          <track kind="captions" />
          Your browser does not support the video tag.
        </video>
      )
    }

    if (doc.type.startsWith('audio/')) {
      return (
        <audio
          src={previewUrl}
          controls
          className="w-full"
          aria-label={doc.name}
        >
          <track kind="captions" />
          Your browser does not support the audio tag.
        </audio>
      )
    }

    return null
  }

  if (!hasAccess) {
    return (
      <div className={`bg-card rounded-lg shadow-lg p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
            Access Denied
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
        <p className="text-muted-foreground">
          You don&apos;t have permission to view this document. Contact the document owner for access.
        </p>
      </div>
    )
  }

  return (
    <div className={`bg-card rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getFileIcon(doc.type)}</span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {doc.name}
            </h3>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>{formatFileSize(doc.size)}</span>
              <span>{doc.uploadedAt.toLocaleDateString()}</span>
              {doc.encrypted && (
                <div className="flex items-center space-x-1">
                  <LockClosedIcon className="h-4 w-4" />
                  <span>Encrypted</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {content && (
            <>
              <button
                onClick={downloadDocument}
                className="p-2 text-muted-foreground hover:text-foreground"
                title="Download"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
              </button>
              <button
                onClick={shareDocument}
                data-share-button
                className="p-2 text-muted-foreground hover:text-foreground"
                title="Share"
              >
                <ShareIcon className="h-5 w-5" />
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Encryption/Decryption Interface */}
        {doc.encrypted && !decrypted && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center space-x-2 mb-3">
              <LockClosedIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="font-medium text-blue-900 dark:text-blue-100">
                This doc is encrypted
              </span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
              Enter the password to decrypt and view the doc content.
            </p>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter decryption password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleDecrypt()}
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-muted dark:text-foreground pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <button
                onClick={handleDecrypt}
                disabled={!password.trim() || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <LockOpenIcon className="h-4 w-4" />
                )}
                <span>Decrypt</span>
              </button>
            </div>
          </div>
        )}

        {/* Success message for decrypted content */}
        {decrypted && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <LockOpenIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-800 dark:text-green-200">
                Document decrypted successfully
              </span>
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-center space-x-2">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm text-red-800 dark:text-red-200">{error}</span>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-muted-foreground">Loading document...</span>
          </div>
        )}

        {/* Content preview */}
        {content && !loading && (
          <div className="space-y-4">
            {canPreview(doc.type) ? (
              <div className="space-y-4">
                <h4 className="font-medium text-foreground">Preview</h4>
                {renderPreview()}
              </div>
            ) : (
              <div className="text-center py-12 bg-muted rounded-lg">
                <DocumentIcon className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Preview not available for this file type
                </p>
                <button
                  onClick={downloadDocument}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Download to View
                </button>
              </div>
            )}
          </div>
        )}

        {/* Document metadata */}
        {!loading && (
          <div className="mt-6 pt-4 border-t border-border">
            <h4 className="font-medium text-foreground mb-3">Document Information</h4>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="font-medium text-foreground">Type</dt>
                <dd className="text-muted-foreground">{doc.type || 'Unknown'}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Size</dt>
                <dd className="text-muted-foreground">{formatFileSize(doc.size)}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Uploaded</dt>
                <dd className="text-muted-foreground">
                  {doc.uploadedAt.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">IPFS Hash</dt>
                <dd className="text-muted-foreground font-mono text-xs break-all">
                  {doc.hash}
                </dd>
              </div>
              {doc.tags && doc.tags.length > 0 && (
                <div className="col-span-2">
                  <dt className="font-medium text-foreground">Tags</dt>
                  <dd className="text-muted-foreground">
                    <div className="flex flex-wrap gap-2 mt-1">
                      {doc.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs bg-muted text-foreground rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  )
}
