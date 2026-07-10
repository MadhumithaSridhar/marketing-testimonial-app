import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Star, Building2, User, Check, Filter, ChevronDown, Upload, FileText, X } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Badge } from '@components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { cn } from '@lib/utils';

// Rating labels for filtering
const RATING_LEVELS = [
  '5 - Excellent',
  '4 - Good',
  '3 - Neutral',
  '2 - Dissatisfied',
  '1 - Very Dissatisfied'
];

const PAGE_SIZE = 12;

// Maps the exact CSV column headers to the field names used throughout the UI
const COLUMN_MAP = {
  'Participant': 'participant',
  'First Name': 'firstName',
  'Last Name': 'lastName',
  'Company': 'company',
  'Position or Title': 'positionOrTitle',
  'How would you rate the overall value of the session?': 'howWouldYouRateTheOverallValueOfTheSession',
  'How engaging was the session?': 'howEngagingWasTheSession',
  'How interested are you in learning more about sessions led by Tracy/Fuse?': 'howInterestedAreYouInLearningMoreAboutSessionsLedByTracyfuse',
  'Would you like a free chat with Tracy about any team, leadership or sales development topics and how Fuse may help?': 'wouldLikeFreeChat',
  'Please share any additional feedback or comments about the session.': 'pleaseShareAnyAdditionalFeedbackOrCommentsAboutTheSession',
  "If you found today's session valuable, please give us the thank-you gift of providing a testimonial about your experience.": 'testimonial',
};

// Placeholder values that should be treated as "no answer"
const isPlaceholder = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  if (trimmed === '"This is some text" or null') return true;
  return false;
};

// Minimal RFC4180-ish CSV parser (handles quoted fields, escaped quotes, and
// commas/newlines inside quotes) so we don't need an extra dependency.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // skip, \n handles the line break
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Push the last field/row if the file doesn't end with a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully empty trailing rows
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

function csvToTestimonials(text) {
  // Strip a UTF-8 BOM if present
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows = parseCSV(cleaned);
  if (rows.length === 0) return [];

  const headerRow = rows[0];
  const keys = headerRow.map(h => COLUMN_MAP[h.trim()] || null);

  const items = [];
  for (let r = 1; r < rows.length; r++) {
    const rawRow = rows[r];
    const item = {};
    keys.forEach((key, idx) => {
      if (key) {
        item[key] = (rawRow[idx] ?? '').trim();
      }
    });

    // Skip rows with no usable name at all
    if (!item.firstName && !item.lastName && !item.company) continue;

    item.id = item.participant ? `p-${item.participant}` : `row-${r}`;
    items.push(item);
  }

  return items;
}

export default function App() {
  const [allTestimonials, setAllTestimonials] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRatings, setSelectedRatings] = useState([]);
  const [approvedItems, setApprovedItems] = useState(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset pagination whenever filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [debouncedSearch, selectedRatings, allTestimonials]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Please upload a .csv file.');
      return;
    }

    setLoading(true);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = csvToTestimonials(text);
        setAllTestimonials(parsed);
        setFileName(file.name);
        setApprovedItems(new Set());
      } catch (err) {
        console.error('Failed to parse CSV:', err);
        setParseError('Could not parse that file. Please check the CSV format and try again.');
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setParseError('Could not read that file.');
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const clearFile = () => {
    setAllTestimonials([]);
    setFileName(null);
    setApprovedItems(new Set());
    setParseError(null);
  };

  // Toggle rating filter
  const toggleRating = (rating) => {
    setSelectedRatings(prev =>
      prev.includes(rating)
        ? prev.filter(r => r !== rating)
        : [...prev, rating]
    );
  };

  // Toggle approval (local only — no backend to sync to)
  const toggleApproval = (itemId) => {
    setApprovedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // Get rating color
  const getRatingColor = (rating) => {
    if (rating?.includes('5 - Excellent')) return 'text-primary';
    if (rating?.includes('4 - Good')) return 'text-foreground';
    return 'text-muted-foreground';
  };

  // Apply search + rating filters client-side
  const filteredTestimonials = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();

    return allTestimonials.filter((t) => {
      if (selectedRatings.length > 0 &&
          !selectedRatings.includes(t.howWouldYouRateTheOverallValueOfTheSession)) {
        return false;
      }

      if (term) {
        const haystack = [t.firstName, t.lastName, t.company]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [allTestimonials, debouncedSearch, selectedRatings]);

  const visibleTestimonials = filteredTestimonials.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTestimonials.length;

  // Stats (computed over the filtered set, matching what's on screen)
  const stats = useMemo(() => {
    const excellent = filteredTestimonials.filter(t =>
      t.howWouldYouRateTheOverallValueOfTheSession === '5 - Excellent'
    ).length;
    const approved = filteredTestimonials.filter(t => approvedItems.has(t.id)).length;
    return { total: filteredTestimonials.length, excellent, approved };
  }, [filteredTestimonials, approvedItems]);

  const hasData = allTestimonials.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-1">
                Testimonial Manager
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and approve client feedback from workshops
              </p>
            </div>
            <div className="flex items-center gap-6">
              {hasData && (
                <div className="flex gap-6 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-foreground">{stats.total}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-primary">{stats.excellent}</div>
                    <div className="text-muted-foreground">Excellent</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-semibold text-foreground">{stats.approved}</div>
                    <div className="text-muted-foreground">Approved</div>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
              {hasData ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="gap-1.5 font-normal">
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[160px] truncate">{fileName}</span>
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Replace CSV
                  </Button>
                </div>
              ) : (
                <Button variant="default" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Upload CSV
                </Button>
              )}
            </div>
          </div>

          {/* Filters */}
          {hasData && (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Rating
                    {selectedRatings.length > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                        {selectedRatings.length}
                      </Badge>
                    )}
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {RATING_LEVELS.map(rating => (
                    <DropdownMenuCheckboxItem
                      key={rating}
                      checked={selectedRatings.includes(rating)}
                      onCheckedChange={() => toggleRating(rating)}
                    >
                      {rating}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={`skeleton-${i}`} className="border border-border bg-card rounded-lg p-6">
                <Skeleton className="h-4 w-3/4 mb-4" />
                <Skeleton className="h-20 w-full mb-4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : !hasData ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center text-center py-20 px-6 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
              isDragging ? "border-primary bg-accent" : "border-border hover:border-muted-foreground"
            )}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">Upload a testimonial CSV</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Drag and drop your survey export here, or click to browse. Expected columns include
              name, company, ratings, and feedback.
            </p>
            <Button variant="default" className="gap-2" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              <Upload className="h-4 w-4" />
              Choose File
            </Button>
            {parseError && (
              <p className="text-sm text-destructive mt-4">{parseError}</p>
            )}
          </div>
        ) : filteredTestimonials.length === 0 ? (
          <div className="text-center py-16">
            <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No testimonials found</h3>
            <p className="text-sm text-muted-foreground">
              {searchTerm || selectedRatings.length > 0
                ? 'Try adjusting your filters'
                : 'Client feedback will appear here'}
            </p>
          </div>
        ) : (
          <>
            {parseError && (
              <div className="mb-6 flex items-center gap-2 text-sm text-destructive">
                <X className="h-4 w-4" />
                {parseError}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleTestimonials.map((item) => {
                const isApproved = approvedItems.has(item.id);
                const rating = item.howWouldYouRateTheOverallValueOfTheSession;
                const feedback = !isPlaceholder(item.pleaseShareAnyAdditionalFeedbackOrCommentsAboutTheSession)
                  ? item.pleaseShareAnyAdditionalFeedbackOrCommentsAboutTheSession
                  : null;
                const testimonialQuote = !isPlaceholder(item.testimonial)
                  ? item.testimonial
                  : null;
                const quote = testimonialQuote || feedback;

                return (
                  <article
                    key={item.id}
                    className={cn(
                      "border rounded-lg p-6 bg-card transition-all duration-200",
                      isApproved
                        ? "border-primary shadow-sm"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-1 truncate">
                          {item.firstName} {item.lastName}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          {item.positionOrTitle && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {item.positionOrTitle}
                            </span>
                          )}
                        </div>
                        {item.company && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{item.company}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={isApproved ? "default" : "outline"}
                        onClick={() => toggleApproval(item.id)}
                        className="ml-2 flex-shrink-0"
                      >
                        {isApproved ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Check className="h-4 w-4 opacity-50" />
                        )}
                      </Button>
                    </div>

                    {/* Ratings */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Overall Value</span>
                        <span className={cn("font-medium", getRatingColor(rating))}>
                          {rating?.split(' - ')[0] || 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Engagement</span>
                        <span className={cn("font-medium", getRatingColor(item.howEngagingWasTheSession))}>
                          {item.howEngagingWasTheSession?.split(' - ')[0] || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Feedback / Testimonial Quote */}
                    {quote && (
                      <blockquote className="mt-4 pt-4 border-t border-border">
                        <p className="text-sm text-foreground leading-relaxed line-clamp-4 italic">
                          "{quote}"
                        </p>
                      </blockquote>
                    )}

                    {/* Interest Badge */}
                    {item.howInterestedAreYouInLearningMoreAboutSessionsLedByTracyfuse === '5 - Very Interested' && (
                      <Badge variant="secondary" className="mt-4 text-xs">
                        <Star className="h-3 w-3 mr-1" />
                        High Interest
                      </Badge>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Load More */}
            {hasMore && (
              <div className="mt-8 text-center">
                <Button
                  variant="outline"
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="min-w-[160px]"
                >
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
