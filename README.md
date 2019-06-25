# TinyECS (ES6)

NOTE: Work in progress

A mean lean Entity-Component-System library.

TinyECS (ES6) is not a ready-to-go game engine framework, it is a small library of
some very performance critical pieces and common utility classes that can be
used to make a game from scratch.

## Installation

Works on the server or the browser (via [Browserify](http://browserify.org)):

```
npm install tiny-ecs-es6
```

## Usage

Manage your entities via an `EntityManager` instance:

```javascript
import {EntityManager} from 'tiny-ecs-es6';

let entities = new EntityManager();
```

### Creating Entities

Create an entity:

```javascript
let hero = entities.createEntity();
```

### Adding Components

A component is just a basic Javascript class.

```javascript
import {Component} from 'tiny-ecs-es6';

class PlayerControlled extends Component
{
  constructor() {
    super()
    this.gamepad = 1;
  }
}
```

```javascript
class Sprite extends Component
{
  constructor() {
    super()
    this.image = 'hero.png';
  }
  
}
```

Add the components:

```javascript
hero.addComponent(Damager).addComponent(Sprite);
```

We now have new data members on our entity for the components. TinyECS will add
an instance member that is the name of the component constructor, lowercased:

```javascript
hero.playerControlled.gamepad = 2;
hero.sprite.image === 'hero.png'; // true
```

Add arbitrary text tags to an entity:

```javascript
hero.addTag('player');
```

You can also remove components and tags in much the same way:

```javascript
hero.removeComponent(Sprite);
hero.removeTag('player');
```

To determine if an entity has a specific component:

```javascript
if (hero.hasComponent(Transform)) { ... }
```

And to check if an entity has ALL of a set of components:

```javascript
if (hero.hasAllComponents([Transform, Sprite])) { ... }
```

### Querying Entities

The entity manager is setup with indexed queries, allowing extremely fast
querying of the current entities. Querying entities returns an array of
entities.

Get all entities that have a specific set of components:

```javascript
let toDraw = entities.queryComponents([Transform, Sprite]);
```

Get all entities with a certain tag:

```javascript
let enemies = entities.queryTag('enemy');
```

### Removing Entities

```javascript
hero.remove();
```

### Creating Components

Any object constructor can be used as a component, nothing special required.
Components should be lean, primarily data containers, leaving all the heavy
lifting for the systems.

### Creating Systems

In TinyECS, there is no formal notion of a system. A system is considered any
context in which entities and their components are updated. As to how this
occurs will vary depending on your use.

In the example of a game, mainting a list of systems that are instantiated with
some sort of IoC container that request a list of entities seems like a good
idea.

```
class PhysicsSystem
{
  constructor(entities) {
      // Dependency inject -- reference to our EntityManager
      this.entities = entities;
  }

  update(dt, time) {
    let toUpdate = this.entities.queryComponents([Transform, RigidBody]);

    toUpdate.forEach(function(entity) { ... });
    ...
  }
}
```

## Tern Support

The source files are all decorated with [JSDoc3](http://usejsdoc.org/)-style
annotations that work great with the [Tern](http://ternjs.net/) code inference
system. Combined with the Node plugin (see this project's `.tern-project`
file), you can have intelligent autocomplete for methods in this library.

## License
Copyright 2014 Brandon Valosek
Copyright 2019 Gabriel Max

**TinyECS** is released under the MIT license.


