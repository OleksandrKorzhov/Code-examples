#!/usr/bin/env bash

ENV=$1
DEV_ENV="dev"
PROD_ENV="production"

if [[ $ENV != $DEV_ENV && $ENV != $PROD_ENV ]];
then
  echo "The specified env is not allowed."
  echo "Allowed range of ENV values are: $DEV_ENV, $PROD_ENV. You specified $ENV."
  exit 1
fi

function getDBHost
{
    case $ENV in
      $DEV_ENV) echo "recolo-dev-root-database.csg4siec07ox.us-west-2.rds.amazonaws.com" ;;
      $PROD_ENV) echo "recolo-production-root-database.csg4siec07ox.us-west-2.rds.amazonaws.com" ;;
    esac
}

function getProxyServerHost
{
  case $ENV in
    $DEV_ENV) echo "ec2-44-238-134-33.us-west-2.compute.amazonaws.com" ;;
    $PROD_ENV) echo "ec2-44-238-130-103.us-west-2.compute.amazonaws.com" ;;
  esac
}

function getTLSKeyPath
{
  case $ENV in
    $DEV_ENV) echo "~/Documents/Recolo/recolo_dev_ec2_private_key.pem" ;;
    $PROD_ENV) echo "~/Documents/Recolo/recolo_production_ec2_private_key.pem" ;;
  esac
}

LOCAL_PORT="5432"
DB_HOST=$(getDBHost)
DB_PORT="5432"
OS_USERNAME="ubuntu"
PROXY_SERVER_HOST=$(getProxyServerHost)
PATH_TO_TLS_KEY=$(getTLSKeyPath)

echo "Establishing a SSH tunnel to $DB_HOST:$DB_PORT."
echo "Will be bind from $DB_PORT remote port to $LOCAL_PORT local port."
echo "Using SSH key $PATH_TO_TLS_KEY"

ssh -N -L $LOCAL_PORT:$DB_HOST:$DB_PORT $OS_USERNAME@$PROXY_SERVER_HOST -i $PATH_TO_TLS_KEY
#ssh -N -L 5432:recolo-dev-root-database.csg4siec07ox.us-west-2.rds.amazonaws.com:5432 ubuntu@ec2-44-238-134-33.us-west-2.compute.amazonaws.com -i ~/Documents/Recolo/recolo_dev_ec2_private_key.pem
