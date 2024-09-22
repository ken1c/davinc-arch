extends CharacterBody2D

@export_category("Variables")
@export var move_speed: float = 95.00 # 64 pixels per second
@export var friction: float = 0.2 # 20% of the speed is lost per second
@export var acceleration: float = 0.2 # 20% of the speed is gained per second
@export var moving_on_attack: bool = false # If the character can move while attacking

@export_category("Objects")
@export var attack_timer: Timer = null
@export var animation_tree: AnimationTree = null

var state_machine
var is_attacking: bool = false

func _ready():
	state_machine = animation_tree.get("parameters/playback")

func _physics_process(_delta):
	move()
	attack()
	animate()
	move_and_slide()

func move():
	var direction: Vector2 = Vector2(
		Input.get_axis("move_left", "move_right"),
		Input.get_axis("move_up", "move_down")
	)
	
	if direction != Vector2.ZERO:
		animation_tree["parameters/idle/blend_position"] = direction
		animation_tree["parameters/walk/blend_position"] = direction
		animation_tree["parameters/attack/blend_position"] = direction
		velocity.x = lerp(velocity.x, direction.normalized().x * move_speed, acceleration)
		velocity.y = lerp(velocity.y, direction.normalized().y * move_speed, acceleration)
		return

	velocity.x = lerp(velocity.x, direction.normalized().x * move_speed, friction)
	velocity.y = lerp(velocity.y, direction.normalized().y * move_speed, friction)

func attack():
	if Input.is_action_just_pressed("attack") and not is_attacking:
		set_physics_process(moving_on_attack)
		attack_timer.start()
		is_attacking = true

func animate():
	if is_attacking:
		state_machine.travel("attack")
		return
	if velocity.length() > 10:
		state_machine.travel("walk")
		return
	state_machine.travel("idle")

func _on_attack_timer_timeout():
	is_attacking = false
	set_physics_process(true)

# func _on_attack_area_body_entered(body):
# 	if _body.is_in_group("mob"):
# 		_body.damage(10)
