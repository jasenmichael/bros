import { listCatalogSkills } from '../../utils/skills'

export default defineEventHandler(() => {
  return {
    skills: listCatalogSkills().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      source: s.source,
      readOnly: s.readOnly,
    })),
  }
})
