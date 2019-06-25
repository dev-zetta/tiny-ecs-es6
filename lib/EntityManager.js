import Entity from './Entity.js'
import ObjectPool from './ObjectPool.js'
import Messenger from './Messenger.js'

/**
 * Used for indexing our component groups.
 * @constructor
 * @param {Array.<Function>} Components
 * @param {Array<Entity>} entities
 */
class Group {
  constructor(Components, entities) {
    this.Components = Components || []
    this.entities = entities || []
  }
}

/**
 * Manage, create, and destroy entities. Can use methods to mutate entities
 * (tags, components) directly or via the facade on the Entity.
 * @param {Messenger} messenger
 * @constructor
 */
class EntityManager {
  constructor(messenger) {
    /**
     * Event messenger, injected
     * @type {Messenger}
     * @private
     */
    this.messenger = messenger

    /**
     * Map of tags to the list of their entities.
     * @private
     */
    this._tags = {}

    /**
     * @type {Array.<Entity>}
     * @private
     */
    this._entities = []

    /**
     * @type {Array.<Group>}
     * @private
     */
    this._groups = {}

    /**
     * Pool entities.
     * @private
     */
    this._entityPool = new ObjectPool(Entity)

    /**
     * Map of component names to their respective object pools.
     * @private
     */
    this._componentPools = {}
  }

  /**
   * Get a new entity.
   * @return {Entity}
   */
  createEntity() {
    const entity = this._entityPool.aquire()

    this._entities.push(entity)
    entity._manager = this
    this._trigger(EntityManager.ENTITY_CREATED, entity)
    return entity
  }

  /**
   * Cleanly remove entities based on tag. Avoids loop issues.
   * @param {String} tag
   */
  removeEntitiesByTag(tag) {
    const entities = this._tags[tag]

    if (!entities) return

    for (let x = entities.length - 1; x >= 0; x--) {
      const entity = entities[x]
      entity.remove()
    }
  }

  /**
   * Dump all entities out of the manager. Avoids loop issues.
   */
  removeAllEntities() {
    for (let x = this._entities.length - 1; x >= 0; x--) {
      this._entities[x].remove()
    }
  }

  /**
   * Drop an entity. Returns it to the pool and fires all events for removing
   * components as well.
   * @param {Entity} entity
   */
  removeEntity(entity) {
    const index = this._entities.indexOf(entity)

    if (!~index) {
      throw new Error(`Tried to remove entity not in list`)
    }

    this.entityRemoveAllComponents(entity)

    // Remove from entity list
    this._trigger(EntityManager.ENTITY_REMOVE, entity)
    this._entities.splice(index, 1)

    // Remove entity from any tag groups and clear the on-entity ref
    entity._tags.length = 0
    for (const tag in this._tags) {
      const entities = this._tags[tag]
      const n = entities.indexOf(entity)
      if (~n) {
        entities.splice(n, 1)
      }
    }

    // Prevent any acecss and free
    entity._manager = null
    this._entityPool.release(entity)
  }

  /**
   * @param {Entity} entity
   * @param {String} tag
   */
  entityAddTag(entity, tag) {
    let entities = this._tags[tag]

    if (!entities) {
      entities = this._tags[tag] = []
    }

    // Don't add if already there
    if (~entities.indexOf(entity)) {
      return
    }

    // Add to our tag index AND the list on the entity
    entities.push(entity)
    entity._tags.push(tag)
  }

  /**
   * @param {Entity} entity
   * @param {String} tag
   */
  entityRemoveTag(entity, tag) {
    const entities = this._tags[tag]
    if (!entities) {
      return
    }

    const index = entities.indexOf(entity)
    if (!~index) {
      return
    }

    // Remove from our index AND the list on the entity
    entities.splice(index, 1)
    entity._tags.splice(entity._tags.indexOf(tag), 1)
  }

  /**
   * @param {Entity} entity
   * @param {Function} Component
   */
  entityAddComponent(entity, Component) {
    if (~entity._Components.indexOf(Component)) {
      return
    }

    entity._Components.push(Component)

    // Create the reference on the entity to this (aquired) component
    const cName = EntityManager._componentPropertyName(Component)
    let cPool = this._componentPools[cName]
    if (!cPool) {
      cPool = this._componentPools[cName] = new ObjectPool(Component)
    }
    const component = cPool.aquire()
    entity[cName] = component

    // Check each indexed group to see if we need to add this entity to the list
    for (const groupName in this._groups) {
      const group = this._groups[groupName]

      // Only add this entity to a group index if this component is in the group,
      // this entity has all the components of the group, and its not already in
      // the index.
      if (!~group.Components.indexOf(Component)) {
        continue
      }
      if (!entity.hasAllComponents(group.Components)) {
        continue
      }
      if (~group.entities.indexOf(entity)) {
        continue
      }

      group.entities.push(entity)
    }

    this._trigger(EntityManager.COMPONENT_ADDED, entity, Component)
  }

  /**
   * Drop all components on an entity. Avoids loop issues.
   * @param {Entity} entity
   */
  entityRemoveAllComponents(entity) {
    const Cs = entity._Components

    for (let j = Cs.length - 1; j >= 0; j--) {
      const C = Cs[j]
      entity.removeComponent(C)
    }
  }

  /**
   * @param {Entity} entity
   * @param {Function} Component
   */
  entityRemoveComponent(entity, Component) {
    const index = entity._Components.indexOf(Component)
    if (!~index) {
      return
    }

    this._trigger(EntityManager.COMPONENT_REMOVE, entity, Component)

    // Check each indexed group to see if we need to remove it
    for (const groupName in this._groups) {
      const group = this._groups[groupName]

      if (!~group.Components.indexOf(Component)) {
        continue
      }
      if (!entity.hasAllComponents(group.Components)) {
        continue
      }

      const loc = group.entities.indexOf(entity)
      if (~loc) {
        group.entities.splice(loc, 1)
      }
    }

    // Remove T listing on entity and property ref, then free the component.
    const propName = componentPropertyName(Component)
    entity._Components.splice(index, 1)
    const component = entity[propName]
    delete entity[propName]
    this._componentPools[propName].release(component)
  }

  /**
   * Get a list of entities that have a certain set of components.
   * @param {Array.<Function>} Components
   * @return {Array.<Entity>}
   */
  queryComponents(Components) {
    let group = this._groups[EntityManager._groupKey(Components)]

    if (!group) {
      group = this._indexGroup(Components)
    }

    return group.entities
  }

  /**
   * Get a list of entities that all have a certain tag.
   * @param {String} tag
   * @return {Array.<Entity>}
   */
  queryTag(tag) {
    let entities = this._tags[tag]

    if (entities === undefined) {
      entities = this._tags[tag] = []
    }

    return entities
  }

  /**
   * @return {Number} Total number of entities.
   */
  count() {
    return this._entities.length
  }

  /**
   * Get information about the object pools of the entities and the various
   * components. NOT optimized or garbage collector friendly.
   * @return {Object}
   */
  poolStats() {
    const stats = {}
    const e = this._entityPool
    stats.entity = {
      used: this._entityPool.totalUsed(),
      size: this._entityPool.count
    }

    for (const cName in this._componentPools) {
      const pool = this._componentPools[cName]
      stats[cName] = {
        used: pool.totalUsed(),
        size: pool.count
      }
    }

    return stats
  }

  /**
   * Create an index of entities with a set of components.
   * @param {Array.<Function>} Components
   * @private
   */
  _indexGroup(Components) {
    const key = EntityManager._groupKey(Components)

    if (this._groups[key]) {
      return
    }

    const group = (this._groups[key] = new Group(Components))

    for (let n = 0; n < this._entities.length; n++) {
      const entity = this._entities[n]
      if (entity.hasAllComponents(Components)) {
        group.entities.push(entity)
      }
    }

    return group
  }

  /**
   * Trigger the messenger if we have one.
   * @param {String} event
   * @param {Object=} a
   * @param {Object=} b
   */
  _trigger(event, a, b) {
    if (this.messenger) {
      this.messenger.trigger(event, a, b)
    }
  }

  /**
   * @param {Function} Component
   * @return {String}
   * @private
   */
  static _componentPropertyName(Component) {
    const name = EntityManager._getClassName(Component)
    return name.charAt(0).toLowerCase() + name.slice(1)
  }

  static _getClassName(Clazz) {
    return Clazz.constructor.name
  }

  /**
   * @param {Function} Component
   * @return {String}
   * @private
   */
  static _componentPropertyName(Component) {
    const name = EntityManager._getClassName(Component)
    return name.charAt(0).toLowerCase() + name.slice(1)
  }

  /**
   * @param {Array.<Function>} Components
   * @return {String}
   * @private
   */
  static _groupKey(Components) {
    const names = []
    for (let n = 0; n < Components.length; n++) {
      const T = Components[n]
      names.push(EntityManager._getClassName(T))
    }

    return names
      .map(x => x.toLowerCase())
      .sort()
      .join(`-`)
  }
}

/**
 * Fired AFTER an entity has be created.
 * @event
 */
EntityManager.ENTITY_CREATED = `EntityManager#ENTITY_CREATED`

/**
 * Fired BEFORE an entity has been removed.
 * @event
 */
EntityManager.ENTITY_REMOVE = `EntityManager#ENTITY_REMOVE`

/**
 * Fired AFTER a component has been removed.
 * @event
 */
EntityManager.COMPONENT_ADDED = `EntityManager#COMPONENT_ADDED`

/**
 * Fired BEFORE a component has been removed.
 * @event
 */
EntityManager.COMPONENT_REMOVE = `EntityManager#COMPONENT_REMOVE`

export default EntityManager
