export interface GitHubRepositoryConfig {
  owner: string;
  repo: string;
  token?: string;
}

export interface MergedPullRequest {
  id: string;
  number: number;
  title: string;
  body: string;
  htmlUrl: string;
  mergedAt: string;
  updatedAt: string;
  authorLogin: string;
  baseBranch?: string;
  headBranch?: string;
  labels: string[];
}

export interface GetMergedPullRequestsParams {
  owner?: string;
  repo?: string;
  token?: string;
  targetDate?: string; // YYYY-MM-DD
  dayWindow?: number;
  daysWindow?: number;
  perPage?: number;
  maxPages?: number;
  signal?: AbortSignal;
}

interface GitHubPullRequestApiResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at: string | null;
  updated_at: string;
  user?: {
    login?: string;
  } | null;
  base?: {
    ref?: string;
  } | null;
  head?: {
    ref?: string;
  } | null;
  labels?: Array<{
    name?: string;
  }>;
}

const GITHUB_API_BASE_URL = 'https://api.github.com';
const DAY_MS = 24 * 60 * 60 * 1000;

export function getDefaultGitHubConfig(): GitHubRepositoryConfig {
  return {
    owner: (import.meta.env.VITE_GITHUB_OWNER as string | undefined) ?? '',
    repo: (import.meta.env.VITE_GITHUB_REPO as string | undefined) ?? '',
    token: import.meta.env.DEV
      ? ((import.meta.env.VITE_GITHUB_TOKEN as string | undefined) ?? '')
      : '',
  };
}

export async function getMergedPullRequests(
  params: GetMergedPullRequestsParams = {},
): Promise<MergedPullRequest[]> {
  const defaultConfig = getDefaultGitHubConfig();

  const owner = (params.owner ?? defaultConfig.owner).trim();
  const repo = (params.repo ?? defaultConfig.repo).trim();
  const token = (params.token ?? defaultConfig.token ?? '').trim();

  if (!owner || !repo) {
    throw new Error(
      'GitHub owner / repo が未設定です。.env.local に VITE_GITHUB_OWNER と VITE_GITHUB_REPO を設定するか、画面から入力してください。',
    );
  }

  const perPage = clampNumber(params.perPage ?? 100, 1, 100);
  const maxPages = clampNumber(params.maxPages ?? 3, 1, 10);
  const dayWindow = Math.max(0, params.dayWindow ?? params.daysWindow ?? 3);

  const allPullRequests: GitHubPullRequestApiResponse[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(
      `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    );

    url.searchParams.set('state', 'closed');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('direction', 'desc');
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: params.signal,
      headers: buildGitHubHeaders(token),
    });

    if (!response.ok) {
      throw await createGitHubError(response);
    }

    const pullRequests = (await response.json()) as GitHubPullRequestApiResponse[];
    allPullRequests.push(...pullRequests);

    if (pullRequests.length < perPage) {
      break;
    }
  }

  return allPullRequests
    .filter(hasMergedAt)
    .filter((pullRequest) =>
      isWithinTargetDateWindow(pullRequest.merged_at, params.targetDate, dayWindow),
    )
    .map(mapPullRequest)
    .sort((a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime());
}

function buildGitHubHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function createGitHubError(response: Response): Promise<Error> {
  const responseText = await response.text();
  let message = responseText;

  try {
    const parsed = JSON.parse(responseText) as { message?: string };
    message = parsed.message ?? responseText;
  } catch {
    // JSON以外のエラー本文ならそのまま表示
  }

  return new Error(`GitHub API Error ${response.status} ${response.statusText}: ${message}`);
}

function hasMergedAt(
  pullRequest: GitHubPullRequestApiResponse,
): pullRequest is GitHubPullRequestApiResponse & { merged_at: string } {
  return typeof pullRequest.merged_at === 'string' && pullRequest.merged_at.length > 0;
}

function isWithinTargetDateWindow(
  mergedAt: string,
  targetDate: string | undefined,
  dayWindow: number,
): boolean {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return true;
  }

  const mergedDateKey = mergedAt.slice(0, 10);
  const mergedTime = dateKeyToUtcTime(mergedDateKey);
  const targetTime = dateKeyToUtcTime(targetDate);

  if (!Number.isFinite(mergedTime) || !Number.isFinite(targetTime)) {
    return true;
  }

  return Math.abs(mergedTime - targetTime) <= dayWindow * DAY_MS;
}

function dateKeyToUtcTime(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function mapPullRequest(pullRequest: GitHubPullRequestApiResponse & { merged_at: string }): MergedPullRequest {
  return {
    id: String(pullRequest.id),
    number: pullRequest.number,
    title: pullRequest.title,
    body: pullRequest.body ?? '',
    htmlUrl: pullRequest.html_url,
    mergedAt: pullRequest.merged_at,
    updatedAt: pullRequest.updated_at,
    authorLogin: pullRequest.user?.login ?? 'unknown',
    baseBranch: pullRequest.base?.ref,
    headBranch: pullRequest.head?.ref,
    labels: Array.isArray(pullRequest.labels)
      ? pullRequest.labels
          .map((label) => label.name)
          .filter((labelName): labelName is string => Boolean(labelName))
      : [],
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
