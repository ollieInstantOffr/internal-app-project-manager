import { ProjectDot } from "@/components/ui";

/**
 * Names the project a screen belongs to. The board already had this in its
 * title; every other project screen said only "Backlog" or "Epics", which is
 * the same in every project.
 */
export function ProjectCrumb({ color, name }: { color: string; name: string }) {
  return (
    <div className="panel-project">
      <ProjectDot color={color} size={7} />
      {name}
    </div>
  );
}
