import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRepoTree, getBranches, getFileContext, pathsWithIssues } from "@/lib/repo";
import { RepoBrowser } from "@/components/repo/RepoBrowser";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} code · Arc` };
}

export default async function CodePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ path?: string; ref?: string }>;
}) {
  const { org, user } = await requireOrg();
  const { key } = await params;
  const { path, ref } = await searchParams;

  const project = await db.project.findFirst({
    where: { orgId: org.id, key: key.toUpperCase() },
  });
  if (!project) notFound();

  if (!project.repoFullName || !user.githubToken) {
    return (
      <main className="panel">
        <header className="panel-head panel-head-sm">
          <div>
            <h1 className="panel-title panel-title-sm">Code</h1>
            <div className="panel-sub">Read the connected repository inside the app</div>
          </div>
        </header>
        <div className="panel-body">
          <Empty
            title={project.repoFullName ? "Connect your GitHub account" : "No repository linked"}
            hint={
              project.repoFullName
                ? `${project.repoFullName} is linked to this project, but reading it needs your GitHub account.`
                : "Link a repository to this project and its files show up here, mapped to the issues that touch them."
            }
          />
          {!user.githubToken && (
            <Link
              className="btn btn-primary"
              href="/api/auth/github?intent=connect"
              style={{ alignSelf: "center" }}
            >
              Connect GitHub
            </Link>
          )}
        </div>
      </main>
    );
  }

  const repo = project.repoFullName;
  const token = user.githubToken;

  const treeData = await getRepoTree(repo, token, ref).catch(() => null);
  if (!treeData) {
    return (
      <main className="panel">
        <header className="panel-head panel-head-sm">
          <h1 className="panel-title panel-title-sm">Code</h1>
        </header>
        <div className="panel-body">
          <Empty
            title="Couldn't read that repository"
            hint={`GitHub wouldn't return the tree for ${repo}. Check the repo still exists and your account can see it.`}
          />
        </div>
      </main>
    );
  }

  const [branches, flagged] = await Promise.all([
    getBranches(repo, token).catch(() => []),
    pathsWithIssues(org.id, repo),
  ]);

  // Open whatever was asked for, else a sensible landing file.
  const wanted =
    path && treeData.paths.includes(path)
      ? path
      : (treeData.paths.find((p) => /^readme\.md$/i.test(p)) ??
        treeData.paths.find((p) => flagged.includes(p)) ??
        null);

  const file = wanted
    ? await getFileContext({
        orgId: org.id,
        projectId: project.id,
        repo,
        token,
        path: wanted,
        ref: treeData.ref,
      }).catch(() => null)
    : null;

  return (
    <RepoBrowser
      initial={{
        project: { id: project.id, key: project.key, name: project.name },
        repo,
        ref: treeData.ref,
        tree: treeData.tree,
        paths: treeData.paths,
        fileCount: treeData.fileCount,
        truncated: treeData.truncated,
        syncedAt: treeData.syncedAt,
        branches,
        flaggedPaths: flagged,
      }}
      initialFile={file}
    />
  );
}
