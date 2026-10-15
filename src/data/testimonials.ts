export interface TestimonialItem {
  id: string;
  name: string;
  role: string;
  company?: string;
  quoteAr: string;
  quoteEn: string;
  avatarUrl?: string;
  rating?: number;
  date?: string;
}

// Strictly empty by default per Ground Rule 3: NEVER fabricate data.
// No invented testimonials, user counts, certifications, or customer names.
// The site owner can populate verified customer reviews into this catalog.
export const TESTIMONIALS_DATA: TestimonialItem[] = [];
