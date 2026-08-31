pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  triggers {
    pollSCM('H/2 * * * *')
  }

  stages {
    stage('Deploy') {
      steps {
        sh '''
          set -e
          cd /root/apps/iCarSell
          git fetch origin master
          git checkout master
          git reset --hard origin/master
          docker compose -p icarsell -f docker-compose.yml -f docker-compose.prod.yml build
          docker compose -p icarsell -f docker-compose.yml -f docker-compose.prod.yml up -d
          docker image prune -f
        '''
      }
    }
  }

  post {
    success {
      echo 'Deploy de iCarSell completado.'
    }
    failure {
      echo 'Deploy de iCarSell fallido — revisar el log de esta build.'
    }
  }
}
