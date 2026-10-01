# The ingress ALB reaches the app through NodePort services on the worker
# nodes (backend 30080, frontend 30081, sentry 30082). The EKS module's node
# security group doesn't open those ports, so without this rule every ALB
# target is unhealthy and the listener returns 502s.
resource "aws_vpc_security_group_ingress_rule" "alb_to_node_nodeports" {
  security_group_id            = module.eks.node_security_group_id
  referenced_security_group_id = module.nginx_ingress.security_group_id
  from_port                    = 30080
  to_port                      = 30082
  ip_protocol                  = "tcp"
  description                  = "Ingress ALB to NodePort services (backend/frontend/sentry)"
}

# Attaching the node group's ASG (not individual instances) means every
# current and future node self-registers with the ALB target groups on
# launch. Managed node groups create the ASG outside Terraform state; the
# EKS module v21 output exposes its generated name.
resource "aws_autoscaling_attachment" "alb_backend" {
  autoscaling_group_name = one(module.eks.eks_managed_node_groups_autoscaling_group_names)
  lb_target_group_arn    = module.nginx_ingress.target_group_backend_arn
}

resource "aws_autoscaling_attachment" "alb_frontend" {
  autoscaling_group_name = one(module.eks.eks_managed_node_groups_autoscaling_group_names)
  lb_target_group_arn    = module.nginx_ingress.target_group_frontend_arn
}

resource "aws_autoscaling_attachment" "alb_sentry" {
  autoscaling_group_name = one(module.eks.eks_managed_node_groups_autoscaling_group_names)
  lb_target_group_arn    = module.nginx_ingress.target_group_sentry_arn
}
