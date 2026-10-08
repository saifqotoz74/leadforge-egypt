import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthError, requireAuth, verifyCsrfOrigin } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog } from '@/lib/audit';
import { invalidateAndRecalculateDeveloperMatches } from '@/lib/matching/service';

export const dynamic = 'force-dynamic';

const profileUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  companyName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
  preferredServices: z.array(z.string()).optional(),
  excludedServices: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  supportedGovernorates: z.array(z.string()).optional(),
  supportedCities: z.array(z.string()).optional(),
  supportedDistricts: z.array(z.string()).optional(),
  preferredCities: z.array(z.string()).optional(),
  excludedLocations: z.array(z.string()).optional(),
  allLocationsMode: z.boolean().optional(),
  niches: z.array(z.string()).optional(),
  preferredNiches: z.array(z.string()).optional(),
  excludedNiches: z.array(z.string()).optional(),
  allNichesMode: z.boolean().optional(),
  leadPreferences: z.array(z.string()).optional(),
  supportedLeadTypes: z.array(z.string()).optional(),
  preferredLeadTypes: z.array(z.string()).optional(),
  excludedLeadTypes: z.array(z.string()).optional(),
  minBudget: z.number().min(0).optional(),
  maxBudget: z.number().min(0).nullable().optional(),
  preferredMinBudget: z.number().min(0).nullable().optional(),
  preferredMaxBudget: z.number().min(0).nullable().optional(),
  budgetCurrency: z.string().optional(),
  leadType: z.enum(['BOTH', 'EXCLUSIVE', 'SHARED']).optional(),
  isActive: z.boolean().optional(),
  isAcceptingLeads: z.boolean().optional(),
  maxActiveLeads: z.number().min(1).nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      profile: user.developerProfile,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: 'تعذر جلب ملف المطور.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json({ error: 'طلب غير مصرح به (CSRF).' }, { status: 403 });
    }

    const user = await requireAuth(req);
    const body = await req.json();
    const parsed = profileUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'بيانات الملف الشخصي غير صالحة' },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.name) {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: data.name.trim() },
      });
    }

    const minBudget = data.minBudget ?? user.developerProfile?.minBudget ?? 5000;
    const maxBudget =
      data.maxBudget !== undefined ? data.maxBudget : user.developerProfile?.maxBudget ?? 50000;
    const budgetRange = `${minBudget}-${maxBudget ?? 100000}`;

    const services = data.services ?? user.developerProfile?.services ?? ['Website Development'];
    const locations = data.locations ?? user.developerProfile?.locations ?? ['القاهرة', 'الجيزة'];
    const niches = data.niches ?? user.developerProfile?.niches ?? ['Dental', 'Medical', 'Restaurant'];
    const allLocationsMode =
      data.allLocationsMode ?? user.developerProfile?.allLocationsMode ?? false;
    const allNichesMode =
      data.allNichesMode ?? user.developerProfile?.allNichesMode ?? false;
    const isComplete =
      services.length > 0 &&
      (allLocationsMode ||
        locations.length > 0 ||
        (data.supportedCities?.length ?? 0) > 0 ||
        (data.supportedGovernorates?.length ?? 0) > 0) &&
      (allNichesMode || niches.length > 0);

    const updatedProfile = await prisma.developerProfile.upsert({
      where: { userId: user.id },
      update: {
        companyName: data.companyName !== undefined ? data.companyName : undefined,
        phone: data.phone !== undefined ? data.phone : undefined,
        bio: data.bio !== undefined ? data.bio : undefined,
        services: data.services,
        preferredServices: data.preferredServices,
        excludedServices: data.excludedServices,
        locations: data.locations,
        supportedGovernorates: data.supportedGovernorates,
        supportedCities: data.supportedCities,
        supportedDistricts: data.supportedDistricts,
        preferredCities: data.preferredCities,
        excludedLocations: data.excludedLocations,
        allLocationsMode: data.allLocationsMode,
        niches: data.niches,
        preferredNiches: data.preferredNiches,
        excludedNiches: data.excludedNiches,
        allNichesMode: data.allNichesMode,
        leadPreferences: data.leadPreferences,
        supportedLeadTypes: data.supportedLeadTypes,
        preferredLeadTypes: data.preferredLeadTypes,
        excludedLeadTypes: data.excludedLeadTypes,
        minBudget: data.minBudget,
        maxBudget: data.maxBudget,
        preferredMinBudget: data.preferredMinBudget,
        preferredMaxBudget: data.preferredMaxBudget,
        budgetCurrency: data.budgetCurrency,
        budgetRange,
        leadType: data.leadType,
        isActive: data.isActive,
        isAcceptingLeads: data.isAcceptingLeads,
        maxActiveLeads: data.maxActiveLeads,
      },
      create: {
        userId: user.id,
        companyName: data.companyName || null,
        phone: data.phone || null,
        bio: data.bio || null,
        services,
        preferredServices: data.preferredServices || [],
        excludedServices: data.excludedServices || [],
        locations,
        supportedGovernorates: data.supportedGovernorates || [],
        supportedCities: data.supportedCities || [],
        supportedDistricts: data.supportedDistricts || [],
        preferredCities: data.preferredCities || [],
        excludedLocations: data.excludedLocations || [],
        allLocationsMode,
        niches,
        preferredNiches: data.preferredNiches || [],
        excludedNiches: data.excludedNiches || [],
        allNichesMode,
        leadPreferences: data.leadPreferences || ['NO_WEBSITE', 'POOR_WEBSITE'],
        supportedLeadTypes: data.supportedLeadTypes || [],
        preferredLeadTypes: data.preferredLeadTypes || [],
        excludedLeadTypes: data.excludedLeadTypes || [],
        minBudget,
        maxBudget,
        preferredMinBudget: data.preferredMinBudget ?? null,
        preferredMaxBudget: data.preferredMaxBudget ?? null,
        budgetCurrency: data.budgetCurrency || 'EGP',
        budgetRange,
        leadType: data.leadType || 'BOTH',
        isActive: data.isActive ?? true,
        isAcceptingLeads: data.isAcceptingLeads ?? true,
        maxActiveLeads: data.maxActiveLeads ?? null,
      },
    });

    await invalidateAndRecalculateDeveloperMatches(user.id);

    await createAuditLog(
      {
        userId: user.id,
        action: 'DEVELOPER_PROFILE_UPDATED',
        entityType: 'DeveloperProfile',
        entityId: updatedProfile.id,
      },
      prisma
    );

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('PATCH /api/developer/profile error:', err);
    return NextResponse.json({ error: 'تعذر تحديث ملف المطور.' }, { status: 500 });
  }
}
