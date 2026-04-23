import { useState } from "react";
import Modal from "./ui/Modal";
import { useAppStore } from "../store/appStore";
import { useShallow } from "zustand/react/shallow";
import {
  REQUIRED_FIELD_MESSAGE,
  invalidFieldClassName,
} from "../utils/formValidation.js";

const EMPTY_FORM = {
  name: "",
  projectKey: "",
  description: "",
};

export default function ProjectManagementView({
  projects,
  canManageOrganization = false,
  canOpenProjectSettings,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onConfigureProject,
  onNotify,
}) {
  const canConfigure = (project) =>
    typeof canOpenProjectSettings === "function"
      ? canOpenProjectSettings(project)
      : false;
  const {
    projectMgmtForm: form,
    setProjectMgmtForm: setForm,
    projectMgmtEditForm: editForm,
    setProjectMgmtEditForm: setEditForm,
    projectMgmtShowCreateModal: showCreateModal,
    setProjectMgmtShowCreateModal: setShowCreateModal,
    projectMgmtShowEditModal: showEditModal,
    setProjectMgmtShowEditModal: setShowEditModal,
    projectMgmtEditingProjectId: editingProjectId,
    setProjectMgmtEditingProjectId: setEditingProjectId,
  } = useAppStore(
    useShallow((state) => ({
      projectMgmtForm: state.projectMgmtForm,
      setProjectMgmtForm: state.setProjectMgmtForm,
      projectMgmtEditForm: state.projectMgmtEditForm,
      setProjectMgmtEditForm: state.setProjectMgmtEditForm,
      projectMgmtShowCreateModal: state.projectMgmtShowCreateModal,
      setProjectMgmtShowCreateModal: state.setProjectMgmtShowCreateModal,
      projectMgmtShowEditModal: state.projectMgmtShowEditModal,
      setProjectMgmtShowEditModal: state.setProjectMgmtShowEditModal,
      projectMgmtEditingProjectId: state.projectMgmtEditingProjectId,
      setProjectMgmtEditingProjectId: state.setProjectMgmtEditingProjectId,
    })),
  );
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingProjectId(null);
  };

  const startEdit = (project) => {
    setEditingProjectId(project.id);
    setEditForm({
      name: project.name,
      projectKey: project.projectKey,
      description: project.description || "",
    });
    setShowEditModal(true);
  };

  const projectBeingEdited =
    showEditModal && editingProjectId
      ? projects.find((p) => String(p.id) === String(editingProjectId))
      : null;

  const [createFieldErrors, setCreateFieldErrors] = useState({});
  const [editFieldErrors, setEditFieldErrors] = useState({});

  return (
    <section className="grid gap-[0.9rem] rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">Projects</h2>
        {canManageOrganization ? (
          <button type="button" onClick={() => setShowCreateModal(true)}>
            Add Project
          </button>
        ) : null}
      </div>

      <div className="grid gap-[0.7rem]">
        {!projects.length ? (
          <p className="text-[#5e6c84]">
            {canManageOrganization
              ? "No projects yet. Use Add Project to create one."
              : "No projects assigned to you yet. Ask an administrator to add you to a project."}
          </p>
        ) : null}
        {projects.map((project) => (
          <article
            key={project.id}
            className="rounded-lg border border-[#dfe1e6] bg-white p-[0.8rem]"
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={`m-[-0.15rem_-0.35rem] min-w-0 flex-1 rounded-md px-[0.35rem] py-[0.15rem] text-left text-inherit ${canConfigure(project) ? "hover:bg-[#f4f5f7]" : ""}`}
                role={canConfigure(project) ? "button" : undefined}
                tabIndex={canConfigure(project) ? 0 : undefined}
                onClick={
                  canConfigure(project)
                    ? () => onConfigureProject(project.id)
                    : undefined
                }
                onKeyDown={
                  canConfigure(project)
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onConfigureProject(project.id);
                        }
                      }
                    : undefined
                }
              >
                <strong>
                  {project.name} ({project.projectKey})
                </strong>
                <div className="text-[#5e6c84]">
                  {project.description || "No description"}
                </div>
                <div className="mt-1 flex flex-wrap gap-[0.35rem]">
                  {(project.members || []).map((member) => (
                    <span
                      key={member.id}
                      className="rounded-full border border-[#c1d3ff] bg-[#edf3ff] px-[0.45rem] py-[0.2rem] text-[0.75rem] text-[#1f3f7f]"
                    >
                      {member.name}
                    </span>
                  ))}
                </div>
              </div>
              {canConfigure(project) ? (
                <div className="flex items-center gap-2 self-center">
                  <button type="button" onClick={() => startEdit(project)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="border border-[#dc2626] bg-[#dc2626] text-white hover:border-[#b91c1c] hover:bg-[#b91c1c]"
                    onClick={() => onDeleteProject(project.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {canManageOrganization && showCreateModal ? (
        <Modal
          open={showCreateModal}
          onOpenChange={(open) => {
            setShowCreateModal(open);
            if (!open) setCreateFieldErrors({});
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Create Project</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => {
                setCreateFieldErrors({});
                setShowCreateModal(false);
              }}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Project Name <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                placeholder="Enter project name"
                value={form.name}
                className={invalidFieldClassName(
                  Boolean(createFieldErrors.name),
                )}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, name: e.target.value }));
                  if (createFieldErrors.name)
                    setCreateFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
            </label>
            {createFieldErrors.name ? (
              <p className="text-[0.78rem] text-red-600">
                {createFieldErrors.name}
              </p>
            ) : null}
            <label>
              <span className="inline-flex items-center">
                Short code <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                placeholder="e.g. OPS"
                value={form.projectKey}
                className={invalidFieldClassName(
                  Boolean(createFieldErrors.projectKey),
                )}
                onChange={(e) => {
                  setForm((prev) => ({
                    ...prev,
                    projectKey: e.target.value.toUpperCase(),
                  }));
                  if (createFieldErrors.projectKey)
                    setCreateFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.projectKey;
                      return n;
                    });
                }}
              />
            </label>
            {createFieldErrors.projectKey ? (
              <p className="text-[0.78rem] text-red-600">
                {createFieldErrors.projectKey}
              </p>
            ) : null}
            <label>
              Description
              <textarea
                rows={3}
                placeholder="Enter description"
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => {
                  setCreateFieldErrors({});
                  setShowCreateModal(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const err = {};
                  if (!form.name.trim()) err.name = REQUIRED_FIELD_MESSAGE;
                  if (!form.projectKey.trim())
                    err.projectKey = REQUIRED_FIELD_MESSAGE;
                  if (Object.keys(err).length) {
                    setCreateFieldErrors(err);
                    return;
                  }
                  setCreateFieldErrors({});
                  const normalizedName = form.name.trim().toLowerCase();
                  const normalizedKey = form.projectKey.trim().toUpperCase();
                  const nameExists = projects.some(
                    (project) =>
                      String(project.name || "")
                        .trim()
                        .toLowerCase() === normalizedName,
                  );
                  if (nameExists) {
                    onNotify?.("Project name already in use.", "error");
                    return;
                  }
                  const keyExists = projects.some(
                    (project) =>
                      String(project.projectKey || "")
                        .trim()
                        .toUpperCase() === normalizedKey,
                  );
                  if (keyExists) {
                    onNotify?.("Project short code already in use.", "error");
                    return;
                  }
                  try {
                    await onCreateProject({
                      name: form.name.trim(),
                      projectKey: normalizedKey,
                      description: form.description,
                    });
                    setForm(EMPTY_FORM);
                    setShowCreateModal(false);
                  } catch (error) {
                    onNotify?.(
                      error?.message || "Failed to create project.",
                      "error",
                    );
                  }
                }}
              >
                Create Project
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {projectBeingEdited && canConfigure(projectBeingEdited) ? (
        <Modal
          open={showEditModal}
          onOpenChange={(open) => {
            if (!open) {
              setEditFieldErrors({});
              closeEditModal();
            }
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h3>Edit project</h3>
            <button
              type="button"
              className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
              onClick={() => {
                setEditFieldErrors({});
                closeEditModal();
              }}
            >
              X
            </button>
          </div>
          <div className="grid gap-[0.6rem]">
            <label>
              <span className="inline-flex items-center">
                Project Name <span className="ml-1 text-red-600">*</span>
              </span>
              <input
                placeholder="Enter project name"
                value={editForm.name}
                className={invalidFieldClassName(Boolean(editFieldErrors.name))}
                onChange={(e) => {
                  setEditForm((prev) => ({ ...prev, name: e.target.value }));
                  if (editFieldErrors.name)
                    setEditFieldErrors((prev) => {
                      const n = { ...prev };
                      delete n.name;
                      return n;
                    });
                }}
              />
            </label>
            {editFieldErrors.name ? (
              <p className="text-[0.78rem] text-red-600">
                {editFieldErrors.name}
              </p>
            ) : null}
            <label>
              <span className="inline-flex items-center">
                Short code <span className="ml-1 text-red-600">*</span>
              </span>

              <input
                placeholder="e.g. OPS"
                value={editForm.projectKey}
                disabled
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    projectKey: e.target.value.toUpperCase(),
                  }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                placeholder="Enter description"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="border border-[#dfe1e6] bg-transparent text-[#42526e] hover:bg-[#f4f5f7]"
                onClick={() => {
                  setEditFieldErrors({});
                  closeEditModal();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!String(editForm.name || "").trim()) {
                    setEditFieldErrors({ name: REQUIRED_FIELD_MESSAGE });
                    return;
                  }
                  setEditFieldErrors({});
                  const normalizedName = String(editForm.name || "")
                    .trim()
                    .toLowerCase();
                  const normalizedKey = String(editForm.projectKey || "")
                    .trim()
                    .toUpperCase();
                  const duplicateName = projects.some(
                    (project) =>
                      String(project.id) !== String(editingProjectId) &&
                      String(project.name || "")
                        .trim()
                        .toLowerCase() === normalizedName,
                  );
                  if (duplicateName) {
                    onNotify?.("Project name already in use.", "error");
                    return;
                  }
                  const duplicateKey = projects.some(
                    (project) =>
                      String(project.id) !== String(editingProjectId) &&
                      String(project.projectKey || "")
                        .trim()
                        .toUpperCase() === normalizedKey,
                  );
                  if (duplicateKey) {
                    onNotify?.("Project short code already in use.", "error");
                    return;
                  }
                  try {
                    await onUpdateProject(editingProjectId, {
                      ...editForm,
                      name: String(editForm.name || "").trim(),
                      projectKey: normalizedKey,
                    });
                    closeEditModal();
                  } catch (error) {
                    onNotify?.(
                      error?.message || "Failed to update project.",
                      "error",
                    );
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
