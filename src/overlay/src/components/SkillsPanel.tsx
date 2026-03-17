import type { ISkillAllocation } from '../../../shared/types'

interface SkillsPanelProps {
  skills: ISkillAllocation[]
}

/**
 * SkillsPanel — Renders allocated skills grouped by tier.
 *
 * Active skills get a fire/red left-border accent.
 * Passives get an orange accent.
 * Keystones get a gold accent.
 */
function SkillsPanel({ skills }: SkillsPanelProps): React.JSX.Element {
  /** Group skills by tier */
  const tiers = skills.reduce<Record<string, ISkillAllocation[]>>((groups, skill) => {
    const tier = skill.tier || 'Unknown'
    if (!groups[tier]) groups[tier] = []
    groups[tier].push(skill)
    return groups
  }, {})

  /** Get CSS modifier for node type */
  const getTypeClass = (nodeType: string): string => {
    switch (nodeType) {
      case 'active':
        return 'skill-row--active'
      case 'passive':
        return 'skill-row--passive'
      case 'keystone':
        return 'skill-row--keystone'
      default:
        return ''
    }
  }

  /** Get icon for node type */
  const getTypeIcon = (nodeType: string): string => {
    switch (nodeType) {
      case 'active':
        return '⚔'
      case 'passive':
        return '◆'
      case 'keystone':
        return '★'
      default:
        return '•'
    }
  }

  return (
    <div className="skills-panel">
      {Object.entries(tiers).map(([tier, tierSkills]) => (
        <div key={tier} className="skills-panel__tier">
          <h3 className="skills-panel__tier-name">{tier.toUpperCase()}</h3>
          {tierSkills.map((skill) => (
            <div key={skill.skillName} className={`skill-row ${getTypeClass(skill.nodeType)}`}>
              <span className="skill-row__icon">{getTypeIcon(skill.nodeType)}</span>
              <span className="skill-row__name">{skill.skillName}</span>
              <span className="skill-row__points">
                {skill.points}/{skill.maxPoints}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default SkillsPanel
