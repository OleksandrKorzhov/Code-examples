resource "aws_ecs_cluster" "default" {
  name = "${var.project}-${terraform.workspace}"

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_cluster"
  }
}

resource "aws_ecs_task_definition" "default" {
  family                   = "admin-bro-${var.project}-${terraform.workspace}"
  container_definitions    = <<DEFINISHION
[
  {
    "name": "admin-bro-${var.project}-${terraform.workspace}",
    "image": "${aws_ecr_repository.default.repository_url}:latest",
    "essential": true,
    "cpu": 256,
    "memory": 512,
    "portMappings": [
      {
        "containerPort": 3200
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-region": "us-west-2",
        "awslogs-stream-prefix": "admin-bro-${var.project}-${terraform.workspace}",
        "awslogs-group": "${var.project}-${terraform.workspace}"
      }
    }
  }
]
DEFINISHION
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_agent.arn

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_task_definition"
  }
}

data "aws_iam_policy_document" "ecs_agent" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      identifiers = ["ecs-tasks.amazonaws.com"]
      type        = "Service"
    }
  }
}

resource "aws_iam_role" "ecs_agent" {
  name               = "ecs-agent-${var.project}-${terraform.workspace}"
  assume_role_policy = data.aws_iam_policy_document.ecs_agent.json

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_task_role_definition"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_agent" {
  role       = aws_iam_role.ecs_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

//resource "aws_iam_instance_profile" "ecs_agent" {
//  name = "ecs-agent-${terraform.workspace}"
//  role = aws_iam_role.ecs_agent.name
//}

resource "aws_ecs_service" "default" {
  name                               = "${var.project}-${terraform.workspace}"
  cluster                            = aws_ecs_cluster.default.arn
  task_definition                    = aws_ecs_task_definition.default.arn
  desired_count                      = 1
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  launch_type                        = "FARGATE"

  network_configuration {
    subnets = [
      aws_subnet.public.id,
      aws_subnet.public_b.id
    ]
    assign_public_ip = true
    security_groups  = [aws_security_group.web.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.admin_bro.arn
    container_name   = aws_ecs_task_definition.default.family
    container_port   = 3200
  }

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_service"
  }

  //  lifecycle {
  //    ignore_changes = [desired_count]
  //  }
}

//resource "aws_launch_configuration" "ecs_t2_nano" {
//  name_prefix = "${var.project}-admin-bro-${terraform.workspace}"
//
//  image_id             = "ami-05d33de432484ef34"
//  instance_type        = "t2.nano"
//  iam_instance_profile = aws_iam_instance_profile.ecs_agent.name
//  security_groups      = [aws_security_group.ecs_instance.id]
//
//  user_data = "#!/bin/bash\necho ECS_CLUSTER=${aws_ecs_cluster.default.name} >> /etc/ecs/ecs.config"
//}
//
//resource "aws_autoscaling_group" "admin_bro_ecs" {
//  name                = "admin-bro-ecs-${terraform.workspace}"
//  launch_configuration = aws_launch_configuration.ecs_t2_nano.name
//
//  vpc_zone_identifier = [aws_subnet.public.id]
//  target_group_arns   = [aws_lb_target_group.admin_bro.arn]
//
//  max_size          = 1
//  min_size          = 2
//  desired_capacity  = 1
//  health_check_type = "ELB"
//}

resource "aws_lb" "default" {
  name                             = "lb-${var.project}-${terraform.workspace}"
  load_balancer_type               = "application"
  enable_cross_zone_load_balancing = true

  security_groups = [aws_security_group.web.id]

  subnets = [
    aws_subnet.public.id,
    aws_subnet.public_b.id
  ]

  access_logs {
    bucket = aws_s3_bucket.log_bucket.bucket
    prefix = "/alb-${var.project}-${terraform.workspace}"
  }

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_load_balancer"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.default.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  lifecycle {
    create_before_destroy = false
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.default.id
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = aws_acm_certificate.server_entry.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin_bro.arn
  }
}

resource "aws_lb_target_group" "admin_bro" {
  name   = "admin-bro-${var.project}-${terraform.workspace}"
  vpc_id = aws_vpc.default.id

  port        = 80
  protocol    = "HTTP"
  target_type = "ip"

  lifecycle {
    create_before_destroy = true
  }

  health_check {
    healthy_threshold   = 5
    unhealthy_threshold = 3
    interval            = 30
    timeout             = 15
    enabled             = true
    matcher             = "200,301,302,303,304"
    path                = "/agency/names"
  }

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_load_balancer_target_group"
  }
}

resource "aws_cloudwatch_log_group" "default" {
  name = "${var.project}-${terraform.workspace}"

  tags = {
    project  = var.project
    env      = terraform.workspace
    type     = "ecs"
    resource = "ecs_cloud_watch_log_group"
  }
}

resource "aws_appautoscaling_target" "admin" {
  max_capacity       = 3
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.default.name}/${aws_ecs_service.default.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "admin" {
  name        = "admin-memory-autoscaling"
  policy_type = "TargetTrackingScaling"

  resource_id        = aws_appautoscaling_target.admin.resource_id
  scalable_dimension = aws_appautoscaling_target.admin.scalable_dimension
  service_namespace  = aws_appautoscaling_target.admin.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }

    target_value = 80
  }
}
