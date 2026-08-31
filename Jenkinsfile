pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  triggers {
    cron('H/2 * * * *')
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
          docker compose -p icarsell build
          docker compose -p icarsell up -d
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
